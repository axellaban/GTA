"""
Runs the MODERN_POSTFX GLSL shaders on screenshots without the game, mirroring
CPostFX::RenderModern (src/extras/postfx.cpp) pass by pass with librw's GL3
conventions: power-of-two back buffer with the screen copied to its top rows,
flipped texcoords, im2d xform and the quarter resolution bloom ping-pong.
The unused part of the back buffer is filled with magenta, so any pass that
samples outside the screen shows up and makes the script fail.

usage: python3 preview.py OUTDIR screenshot.png [...]
needs: pip install moderngl pillow numpy (and an EGL capable GL driver, e.g. Mesa)
"""
import math, os, re, sys
import numpy as np
import moderngl
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SHADERS = os.path.join(REPO, 'src', 'extras', 'shaders')
LIBRW_SHADERS = os.path.join(REPO, 'vendor', 'librw', 'src', 'gl', 'shaders')

# same as shaderDecl330/shaderDecl120 in librw's gl3device.cpp
DECL330 = ("#version 330\n"
	"#define VSIN(index) layout(location = index) in\n"
	"#define VSOUT out\n"
	"#define FSIN in\n"
	"#define FRAGCOLOR(c) (fragColor = c)\n")
DECL120 = ("#version 120\n"
	"#define GL2\n"
	"#define texture texture2D\n"
	"#define VSIN(index) attribute\n"
	"#define VSOUT varying\n"
	"#define FSIN varying\n"
	"#define FRAGCOLOR(c) (gl_FragColor = c)\n")

def read(*path):
	with open(os.path.join(*path)) as f:
		return f.read()

def load_presets():
	"""sharpen, bloom, threshold, contrast, vibrance, vignette from ModernFXPresets in postfx.cpp"""
	presets = {}
	for line in read(REPO, 'src', 'extras', 'postfx.cpp').splitlines():
		m = re.search(r'\{([^}]*)\},\s*// MODERNFX_(SUBTLE|VIVID)', line)
		if m:
			presets[m.group(2).lower()] = tuple(float(v.strip().rstrip('f')) for v in m.group(1).split(','))
	assert set(presets) == {'subtle', 'vivid'}, presets
	return presets

class Pipeline:
	def __init__(self, decl=DECL330):
		self.ctx = moderngl.create_standalone_context(backend='egl', require=330)
		vs = decl + read(LIBRW_SHADERS, 'header.vert') + read(LIBRW_SHADERS, 'im2d.vert')
		header = read(LIBRW_SHADERS, 'header.frag')
		self.progs = {name: self.ctx.program(vertex_shader=vs, fragment_shader=decl + header + read(SHADERS, name + '.frag'))
			for name in ('fxaa', 'bloomExtract', 'bloomBlur', 'modernGrade')}
		self.progs['simple'] = self.ctx.program(vertex_shader=vs, fragment_shader=decl + header + read(LIBRW_SHADERS, 'simple.frag'))

	def quad(self, prog, fbw, fbh, width, height, umax, vmax, intensity=255):
		# like SetQuad() in postfx.cpp, HALFPX is 0 on GL
		x = [0.0, 0.0, width, width]
		y = [0.0, height, height, 0.0]
		u = [0.0, 0.0, umax, umax]
		v = [0.0, vmax, vmax, 0.0]
		c = intensity/255.0
		data = []
		for i in (0, 1, 2, 0, 2, 3):
			data += [x[i], y[i], 0.0, 1.0, c, c, c, 1.0, u[i], v[i]]
		vbo = self.ctx.buffer(np.array(data, dtype='f4').tobytes())
		self.set(prog, u_xform=(2.0/fbw, -2.0/fbh, -1.0, 1.0), u_fogData=(0.0, 0.0, 0.0, 1.0),
			u_alphaRef=(-1000.0, 1000.0, 0.0, 0.0), u_fogColor=(0.0, 0.0, 0.0, 0.0))
		vao = self.ctx.vertex_array(prog, [(vbo, '4f 4f 2f', 'in_pos', 'in_color', 'in_tex0')])
		vao.render(moderngl.TRIANGLES)
		vao.release()
		vbo.release()

	@staticmethod
	def set(prog, **uniforms):
		for k, val in uniforms.items():
			if k in prog:
				prog[k].value = tuple(val)

	def texture(self, w, h):
		t = self.ctx.texture((w, h), 4)
		t.filter = (moderngl.LINEAR, moderngl.LINEAR)
		t.repeat_x = t.repeat_y = False
		return t

	def run(self, img, settings, fxaa=True):
		ctx = self.ctx
		h, w = img.shape[:2]
		# CPostFX::Open: next power of two above the screen size
		W = int(2 ** (int(math.log2(w)) + 1))
		H = int(2 ** (int(math.log2(h)) + 1))

		screen = self.texture(w, h)
		screenFbo = ctx.framebuffer(color_attachments=[screen])
		screen.write(np.flipud(np.dstack([img, np.full((h, w), 255, np.uint8)])).copy().tobytes())
		back = self.texture(W, H)
		magenta = np.zeros((H, W, 4), np.uint8)
		magenta[...] = (255, 0, 255, 255)
		back.write(magenta.tobytes())

		def getBackBuffer():
			# librw: glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, H-h, 0, 0, w, h)
			back.write(screenFbo.read(components=4), viewport=(0, H - h, w, h))

		sharpen, bloomIntensity, bloomThreshold, contrast, vibrance, vignette = settings
		doBloom = bloomIntensity > 0.0
		doGrade = sharpen > 0.0 or contrast != 0.0 or vibrance != 0.0 or vignette > 0.0
		texel = (1.0/W, 1.0/H, w/h, 0.0)
		bounds = (0.5/W, 1.0 - (h-0.5)/H, (w-0.5)/W, 1.0 - 0.5/H)

		getBackBuffer()
		ctx.disable(moderngl.BLEND | moderngl.DEPTH_TEST)

		if doBloom:
			bw, bh = max(w//4, 1), max(h//4, 1)
			bloom = [self.texture(bw, bh) for _ in range(2)]
			bloomFbo = [ctx.framebuffer(color_attachments=[t]) for t in bloom]
			bloomFbo[0].use()
			back.use(0)
			p = self.progs['bloomExtract']
			self.set(p, u_texel=texel, u_bounds=bounds, u_bloomParams=(bloomThreshold, 0.1, 0.0, 0.0))
			self.quad(p, bw, bh, bw, bh, w/W, h/H)
			p = self.progs['bloomBlur']
			for i in (1, 2, 3):
				for pas in (0, 1):
					bloomFbo[1-pas].use()
					bloom[pas].use(0)
					self.set(p, u_blurDir=(i/bw if pas == 0 else 0.0, 0.0 if pas == 0 else i/bh, 0.0, 0.0))
					self.quad(p, bw, bh, bw, bh, 1.0, 1.0)

		screenFbo.use()
		if fxaa:
			back.use(0)
			p = self.progs['fxaa']
			self.set(p, u_texel=texel, u_bounds=bounds)
			self.quad(p, w, h, W, H, 1.0, 1.0)
		if doBloom:
			ctx.enable(moderngl.BLEND)
			ctx.blend_func = (moderngl.ONE, moderngl.ONE)
			bloom[0].use(0)
			self.quad(self.progs['simple'], w, h, w, h, 1.0, 1.0, int(min(max(bloomIntensity, 0.0), 1.0)*255))
			ctx.disable(moderngl.BLEND)
		if doGrade:
			if fxaa or doBloom:
				getBackBuffer()
			back.use(0)
			p = self.progs['modernGrade']
			self.set(p, u_texel=texel, u_bounds=bounds, u_screenScale=(W/w, H/h, 0.0, 0.0),
				u_gradeParams=(sharpen, contrast, vibrance, vignette))
			self.quad(p, w, h, W, H, 1.0, 1.0)

		out = np.frombuffer(screenFbo.read(components=3), np.uint8).reshape(h, w, 3)
		return np.flipud(out).copy()

def magenta_leaks(original, result):
	def magenta(a):
		a = a.astype(int)
		return (a[..., 0] - a[..., 1] > 120) & (a[..., 2] - a[..., 1] > 120)
	return int((magenta(result) & ~magenta(original)).sum())

if __name__ == '__main__':
	if len(sys.argv) < 3:
		sys.exit(__doc__)
	Pipeline(DECL120)	# the shaders also have to compile for old GL / GLES2
	pipe = Pipeline()
	presets = load_presets()
	outdir = sys.argv[1]
	os.makedirs(outdir, exist_ok=True)
	failed = False
	for f in sys.argv[2:]:
		img = np.array(Image.open(f).convert('RGB'))
		base = os.path.splitext(os.path.basename(f))[0]
		results = {'fxaa': pipe.run(img, (0.0, 0.0, 1.0, 0.0, 0.0, 0.0))}
		for name, settings in presets.items():
			results[name] = pipe.run(img, settings)
		for name, out in results.items():
			Image.fromarray(out).save(os.path.join(outdir, f'{base}_{name}.png'))
			leaks = magenta_leaks(img, out)
			failed |= leaks > 0
			print(f'{base} {name}: mean change {np.abs(out.astype(int) - img).mean():.2f}, pixels sampled from outside the screen: {leaks}')
	sys.exit(1 if failed else 0)
