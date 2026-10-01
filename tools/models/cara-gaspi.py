# Cara de Gaspi para pegar en la cabeza del modelo de artista (src/people.js, FACE): recorte de la
# foto (gaspi-cara-foto.png, los píxeles reales de la cara de src/gaspi.webp), enderezado, con los ojos
# y el mentón donde los espera la caja FACE, y con borde suave.
# Uso (desde la raíz): pip install numpy pillow && python3 tools/models/cara-gaspi.py 1.048 0.94 src/gaspi-face.webp
import sys, math, os
from PIL import Image, ImageFilter
import numpy as np
# los puntos de abajo (ojos) están medidos en la foto agrandada 6 veces
native = Image.open(os.path.join(os.path.dirname(__file__), 'gaspi-cara-foto.png')).convert('RGB')
S = np.asarray(native.resize((native.width * 6, native.height * 6), Image.BICUBIC)).astype(np.float32)
W = H = 256
sx, sy = float(sys.argv[1]) if len(sys.argv) > 1 else 1.1, float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
eyeL, eyeR = np.array([175.0, 207.5]), np.array([250.0, 190.0])
M = (eyeL + eyeR) / 2
u = (eyeR - eyeL); u /= np.linalg.norm(u)
v = np.array([-u[1], u[0]])
ct = np.array([128.0, 119.2])
ty, tx = np.mgrid[0:H, 0:W].astype(np.float32)
px = M[0] + (tx - ct[0]) / sx * u[0] + (ty - ct[1]) / sy * v[0]
py = M[1] + (tx - ct[0]) / sx * u[1] + (ty - ct[1]) / sy * v[1]
# bilineal
x0 = np.clip(np.floor(px).astype(int), 0, S.shape[1] - 2); y0 = np.clip(np.floor(py).astype(int), 0, S.shape[0] - 2)
fx = np.clip(px - x0, 0, 1)[..., None]; fy = np.clip(py - y0, 0, 1)[..., None]
c = S[y0, x0] * (1 - fx) * (1 - fy) + S[y0, x0 + 1] * fx * (1 - fy) + S[y0 + 1, x0] * (1 - fx) * fy + S[y0 + 1, x0 + 1] * fx * fy
# borde: elipse con fundido
ex, ey, rx, ry, fe = 123, 138, 92, 114, 22
d = np.sqrt(((tx - ex) / rx) ** 2 + ((ty - ey) / ry) ** 2)
a = np.clip((1 - d) * min(rx, ry) / fe, 0, 1)
a = a * a * (3 - 2 * a)
# un poco menos roja que la foto (de lejos parecía insolado): menos saturación, un toque más clara
gray = c.mean(axis=2, keepdims=True)
c = gray + (c - gray) * 0.8
c = c * 1.04 + 4
img = Image.fromarray(np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
out = sys.argv[3] if len(sys.argv) > 3 else 'gaspi-face-tex.png'
img.save(out, 'WEBP', quality=92, method=6) if out.endswith('.webp') else img.save(out)
# tono de piel: mejillas y frente
pts = [(ct[0] - 40, ct[1] + 40), (ct[0] + 40, ct[1] + 40), (ct[0], ct[1] - 45)]
cols = [c[int(y) - 6:int(y) + 6, int(x) - 6:int(x) + 6].reshape(-1, 3).mean(0) for x, y in pts]
print('piel', ['#%02x%02x%02x' % tuple(int(v) for v in k) for k in cols], '#%02x%02x%02x' % tuple(int(v) for v in np.mean(cols, 0)))
