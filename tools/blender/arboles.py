# Árboles de la vereda hechos en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/arboles.py
# Sale:
#   public/textures/hojas_<especie>.webp  dos ramilletes (1024x512, uno en cada mitad) con las hojas modeladas
#       una por una (compuestas en el fresno y la tipa, de helecho en el jacarandá, palmeadas en el palo
#       borracho) y las flores del jacarandá y del palo borracho, renderizados en Cycles desde arriba con
#       fondo transparente: la luz y las sombras entre hojas quedan en la textura.
#   public/models/trees/arboles.glb  por especie (fresno, tipa, jacaranda, palo):
#       tronco_<especie>          tronco con la base ensanchada, ramas maestras y una ramita hasta cada
#                                 ramillete, con la sombra de contacto horneada en los colores de vértice
#       tronco_<especie>_pintado  el mismo con el metro de abajo pintado a la cal (los de la vereda)
#       copa_<especie>            ramilletes de tres hojas cruzadas repartidos en la copa; normales de copa
#                                 redonda (la luz no marca los planos) y lo de adentro más oscuro
# Mismas medidas que los árboles de antes (SPECIES en src/city.js), con la base en y = 0. Los carga
# src/arboles-kit.js.
import math
import os
import random

import bpy  # tiene que ir antes que bmesh
import bmesh
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'trees', 'arboles.glb')
TEX = os.path.join(ROOT, 'public', 'textures', 'hojas_{}.webp')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    # color sRGB (como se elige a ojo) a lineal (lo que guardan los colores de vértice)
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255


def mul(c, k):
    return tuple(min(1.0, v * k) for v in c)


# =====================================================================
# 1. Los ramilletes de hojas, renderizados como textura
# =====================================================================
class Flat:
    # polígonos sueltos con un color por cara (coordenadas de Blender: z hacia la cámara)
    def __init__(self):
        self.bm = bmesh.new()
        self.cols = []

    def poly(self, pts, col):
        self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        self.cols.append(lin(col))

    def done(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        ca = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
        for poly, c in zip(me.polygons, self.cols):
            for li in poly.loop_indices:
                ca.data[li].color = (*c, 1)
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        return ob


def leaflet(F, rnd, base, a, L, W, col, z, tilt):
    # folíolo lanceolado en dos mitades con un pliegue en el nervio (cada mitad recibe la luz distinto)
    ca, sa = math.cos(a), math.sin(a)
    hw = (0, 0.75, 1.0, 0.7, 0)
    fold = W * 0.25

    def P(u, v, dz=0.0):
        return (base[0] + ca * u - sa * v, base[1] + sa * u + ca * v, z + tilt * u + dz)

    for side, k in ((1, 1.05), (-1, 0.93)):
        pts = [P(L * i / 4, side * hw[i] * W / 2, fold if 0 < i < 4 else 0) for i in range(5)]
        F.poly(pts if side > 0 else list(reversed(pts)), mul(col, k))


def stem(F, p0, p1, w, col, z0, z1):
    # tallo o ramita: una tira fina
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    F.poly([(p0[0] + nx, p0[1] + ny, z0), (p0[0] - nx, p0[1] - ny, z0), (p1[0] - nx * 0.6, p1[1] - ny * 0.6, z1), (p1[0] + nx * 0.6, p1[1] + ny * 0.6, z1)], col)


def vary(rnd, col, amt=0.12, warm=0.0):
    k = rnd.uniform(1 - amt, 1 + amt)
    w = rnd.uniform(0, warm)
    return (min(1, col[0] * k + w), min(1, col[1] * k + w * 0.6), col[2] * k)


def pinnate(F, rnd, base, a, pairs, rachis, Lf, Wf, col, z, terminal=True, taper=0.25, spread=(48, 62)):
    # hoja compuesta: el raquis y los folíolos de a pares (más chicos hacia la punta)
    tilt = rnd.uniform(-0.25, 0.35)
    tip = (base[0] + math.cos(a) * rachis, base[1] + math.sin(a) * rachis)
    stem(F, base, tip, 0.008, mul(col, 0.7), z, z + tilt * rachis)
    for i in range(pairs):
        t = (i + 0.7) / (pairs + 0.3)
        q = (base[0] + math.cos(a) * rachis * t, base[1] + math.sin(a) * rachis * t)
        s = 1 - taper * t
        for side in (-1, 1):
            ang = a + side * math.radians(rnd.uniform(*spread))
            leaflet(F, rnd, q, ang, Lf * s * rnd.uniform(0.9, 1.1), Wf * s, vary(rnd, col, 0.08), z + tilt * rachis * t + 0.002, rnd.uniform(-0.3, 0.3))
    if terminal:
        leaflet(F, rnd, tip, a + rnd.uniform(-0.2, 0.2), Lf * (1 - taper * 0.6), Wf * (1 - taper * 0.6), vary(rnd, col, 0.08), z + tilt * rachis + 0.003, rnd.uniform(-0.3, 0.3))


def bipinnate(F, rnd, base, a, col, z):
    # hoja del jacarandá: el raquis con pinnas y cada pinna con folíolos chiquitos (parece un helecho)
    rachis = rnd.uniform(0.3, 0.38)
    tilt = rnd.uniform(-0.2, 0.3)
    tip = (base[0] + math.cos(a) * rachis, base[1] + math.sin(a) * rachis)
    stem(F, base, tip, 0.007, mul(col, 0.65), z, z + tilt * rachis)
    n = 7
    for i in range(n):
        t = (i + 0.8) / (n + 0.4)
        q = (base[0] + math.cos(a) * rachis * t, base[1] + math.sin(a) * rachis * t)
        s = 1 - 0.35 * t
        for side in (-1, 1):
            ang = a + side * math.radians(rnd.uniform(55, 70))
            pinnate(F, rnd, q, ang, 7, 0.13 * s, 0.032 * s, 0.013 * s, vary(rnd, col, 0.1), z + tilt * rachis * t + 0.002, taper=0.3, spread=(55, 70))


def palmate(F, rnd, base, a, col, z):
    # hoja palmeada del palo borracho: cinco a siete folíolos que salen de la punta del pecíolo
    pet = rnd.uniform(0.08, 0.12)
    c = (base[0] + math.cos(a) * pet, base[1] + math.sin(a) * pet)
    stem(F, base, c, 0.007, mul(col, 0.7), z, z)
    n = rnd.choice((5, 5, 6, 7))
    fan = math.radians(rnd.uniform(125, 160))
    for i in range(n):
        t = i / (n - 1) - 0.5
        L = 0.17 * (1 - 0.4 * abs(t) * 2) * rnd.uniform(0.9, 1.1)
        leaflet(F, rnd, c, a + t * fan, L, L * 0.48, vary(rnd, col, 0.08), z + 0.002 + 0.001 * i, rnd.uniform(-0.35, 0.35))


def bell_cluster(F, rnd, c, col, z):
    # panoja de flores del jacarandá: campanitas violetas (vistas de frente: una estrella de cinco puntas)
    for _ in range(rnd.randint(12, 20)):
        r = 0.09 * math.sqrt(rnd.random())
        th = rnd.uniform(0, 2 * math.pi)
        p = (c[0] + r * math.cos(th), c[1] + r * math.sin(th))
        R = rnd.uniform(0.022, 0.03)
        rot = rnd.uniform(0, 2 * math.pi)
        zz = z + rnd.uniform(0, 0.03)
        k = vary(rnd, col, 0.12)
        F.poly([(p[0] + R * (1 if i % 2 == 0 else 0.72) * math.cos(rot + i * math.pi / 5), p[1] + R * (1 if i % 2 == 0 else 0.72) * math.sin(rot + i * math.pi / 5), zz) for i in range(10)], k)
        F.poly([(p[0] + R * 0.4 * math.cos(rot + i * 2 * math.pi / 5), p[1] + R * 0.4 * math.sin(rot + i * 2 * math.pi / 5), zz + 0.002) for i in range(5)], mul(k, 1.25))


def flower5(F, rnd, c, col, z):
    # flor del palo borracho: cinco pétalos rosados y el centro crema
    R = rnd.uniform(0.06, 0.08)
    rot = rnd.uniform(0, 2 * math.pi)
    for i in range(5):
        a = rot + i * 2 * math.pi / 5
        leaflet(F, rnd, c, a, R, R * 0.6, vary(rnd, col, 0.08), z + 0.001 * i, rnd.uniform(0.1, 0.4))
    F.poly([(c[0] + R * 0.22 * math.cos(rot + i * math.pi / 3), c[1] + R * 0.22 * math.sin(rot + i * math.pi / 3), z + 0.02) for i in range(6)], (0.97, 0.93, 0.78))


LEAF = {
    # verde de cada especie (sRGB), cuántas hojas lleva cada ramillete y las flores
    'fresno': dict(col=(0.36, 0.5, 0.2), n=100),
    'tipa': dict(col=(0.5, 0.6, 0.24), n=120),
    'jacaranda': dict(col=(0.3, 0.46, 0.22), n=50, flowers=30, fcol=(0.56, 0.42, 0.86)),
    'palo': dict(col=(0.24, 0.42, 0.17), n=80, flowers=15, fcol=(0.95, 0.45, 0.68)),
}
TWIG = (0.36, 0.28, 0.2)


def cluster(name, seed):
    rnd = random.Random(seed)
    sp = LEAF[name]
    F = Flat()
    # hojas: las del medio más arriba (más cerca de la cámara), como una copita
    reach = {'fresno': 0.42, 'tipa': 0.4, 'jacaranda': 0.46, 'palo': 0.32}[name]
    for i in range(sp['n']):
        # un cuarto sale del medio para cualquier lado (si no, el ramillete queda como una corona hueca);
        # el resto, parejo por todo el círculo
        r = 0.2 * math.sqrt(rnd.random()) if i < sp['n'] / 4 else (0.92 - reach) * math.sqrt(rnd.random())
        th = rnd.uniform(0, 2 * math.pi)
        base = (r * math.cos(th), r * math.sin(th))
        a = th + rnd.uniform(-0.7, 0.7) if r > 0.2 else rnd.uniform(0, 2 * math.pi)
        z = 0.22 * (1 - r / 0.9) + rnd.uniform(0, 0.08)
        # ramita desde el centro (se ve entre las hojas)
        mid = (base[0] * 0.45 + rnd.uniform(-0.05, 0.05), base[1] * 0.45 + rnd.uniform(-0.05, 0.05))
        stem(F, mid, base, 0.012, TWIG, z - 0.06, z - 0.01)
        col = vary(rnd, sp['col'], 0.1, warm=0.04)
        if name == 'fresno':
            pinnate(F, rnd, base, a, 3, 0.2, 0.15, 0.05, col, z, taper=0.15)
        elif name == 'tipa':
            pinnate(F, rnd, base, a, 7, 0.27, 0.075, 0.032, col, z, taper=0.35)
        elif name == 'jacaranda':
            bipinnate(F, rnd, base, a, col, z)
        else:
            palmate(F, rnd, base, a, col, z)
    for _ in range(sp.get('flowers', 0)):
        r = 0.62 * math.sqrt(rnd.random())
        th = rnd.uniform(0, 2 * math.pi)
        c = (r * math.cos(th), r * math.sin(th))
        z = 0.3 * (1 - r / 0.9) + 0.06
        if name == 'jacaranda':
            bell_cluster(F, rnd, c, sp['fcol'], z)
        else:
            flower5(F, rnd, c, sp['fcol'], z)
    return F.done(f'{name}_{seed}')


def setup_render():
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('cielo')
    scene.world = world
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.75, 0.85, 1.0, 1)
    bg.inputs[1].default_value = 0.42
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sun.data.energy = 2.2
    sun.data.angle = math.radians(6)
    # luz de arriba, un poco desde arriba a la izquierda de la imagen
    sun.rotation_euler = Vector((-0.35, 0.45, 1.0)).normalized().to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.0
    cam.location = (0, 0, 5)
    scene.collection.objects.link(cam)
    scene.camera = cam
    mat = bpy.data.materials.new('hoja')
    nt = mat.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'col'
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(attr.outputs['Color'], dif.inputs['Color'])
    nt.links.new(dif.outputs['BSDF'], out.inputs['Surface'])
    return mat, [sun, cam]


def bleed(im):
    # el color de las hojas se corre debajo de lo transparente (si no, el filtrado oscurece el borde)
    a = im[..., 3:4] / 255.0
    rgb = im[..., :3] * a
    acc, w = rgb.copy(), a.copy()
    for s in (1, 2, 4, 8, 16, 32):
        for dx, dy in ((s, 0), (-s, 0), (0, s), (0, -s)):
            acc += np.roll(rgb, (dy, dx), (0, 1))
            w += np.roll(a, (dy, dx), (0, 1))
        rgb, a = acc / np.maximum(w, 1e-6) * np.minimum(w, 1), np.minimum(w, 1)
        acc, w = rgb.copy(), a.copy()
    fill = rgb / np.maximum(a, 1e-6)
    out = im.astype(np.float64)
    hole = im[..., 3] < 255
    k = (im[..., 3:4] / 255.0)
    out[..., :3] = np.where(hole[..., None], im[..., :3] * k + fill * (1 - k), im[..., :3])
    return np.clip(out, 0, 255).astype(np.uint8)


def leaf_textures():
    from PIL import Image
    mat, helpers = setup_render()
    tmp = os.path.join(ROOT, 'public', 'textures', '_hojas_tmp.png')
    for name in LEAF:
        halves = []
        for seed in (1, 2):
            ob = cluster(name, seed * 100 + len(name))
            ob.data.materials.append(mat)
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            halves.append(np.array(Image.open(tmp).convert('RGBA')))
            bpy.data.objects.remove(ob)
        im = bleed(np.concatenate(halves, axis=1))
        Image.fromarray(im, 'RGBA').save(TEX.format(name), 'WEBP', quality=88, exact=True)
        cover = (im[..., 3] > 115).mean()
        print(f'hojas_{name}.webp: {cover:.0%} cubierto')
    os.remove(tmp)
    for o in helpers:
        bpy.data.objects.remove(o)


# =====================================================================
# 2. Los árboles
# =====================================================================
def B(p):
    return (p[0], -p[2], p[1])  # juego (y arriba) -> Blender (z arriba)


class Part:
    # malla en coordenadas del juego con un color por cara
    def __init__(self, name, uv=False):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap') if uv else None
        self.cols = []
        self.normals = []  # normal propia por vértice (en la copa)

    def v(self, p, n=None):
        self.normals.append(n)
        return self.bm.verts.new(B(p))

    def face(self, vs, col, uvs=None, smooth=True):
        f = self.bm.faces.new(vs)
        f.smooth = smooth
        if uvs:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        self.cols.append(col)
        return f

    def tube(self, pts, radii, sides, col, cap=False):
        # anillos perpendiculares al recorrido, con el mismo "arriba" de un anillo al otro (sin retorcerse)
        pts = [Vector(p) for p in pts]
        rings = []
        ref = Vector((1, 0, 0))
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            u = (ref - d * ref.dot(d))
            if u.length < 1e-4:
                u = Vector((0, 0, 1)) - d * d.z
            u.normalize()
            ref = u
            w = d.cross(u)
            r = radii[i]
            rings.append([self.v(p + (u * math.cos(t) + w * math.sin(t)) * r) for t in (2 * math.pi * j / sides for j in range(sides))])
        for i, (a, b) in enumerate(zip(rings, rings[1:])):
            for j in range(sides):
                k = (j + 1) % sides
                self.face((a[j], a[k], b[k], b[j]), col(i) if callable(col) else col)
        if cap:
            self.face(rings[-1], col(len(rings) - 2) if callable(col) else col)
        return rings

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=[f for f in self.bm.faces])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        if any(n is not None for n in self.normals):
            me.normals_split_custom_set_from_vertices([B(n) if n is not None else (0, 0, 1) for n in self.normals])
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        return ob


def set_colors(ob, face_col, ao=None):
    # color final por esquina: el de la cara por la sombra horneada (si hay)
    me = ob.data
    ca = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = face_col(poly)
        for li in poly.loop_indices:
            k = ao[li] if ao is not None else 1
            ca.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1)
    me.color_attributes.active_color = ca


SPECIES = {
    # fork: dónde se abre el tronco; crown: centro y radios de donde van los ramilletes; card: tamaño de
    # cada hoja de la copa. Mismas medidas que SPECIES de src/city.js.
    'fresno': dict(fork=3.1, rb=0.24, rf=0.14, lean=(0.12, 0.05), bark=0x5a4a3a, limbs=4,
                   crown=((0.0, 5.25, 0.0), (2.05, 1.45, 2.05)), clumps=22, card=2.6, seed=11),
    'tipa': dict(fork=3.7, rb=0.33, rf=0.21, lean=(0.1, -0.08), bark=0x62503c, limbs=5,
                 crown=((0.0, 7.05, 0.0), (3.0, 1.75, 3.0)), clumps=28, card=3.0, seed=12),
    'jacaranda': dict(fork=2.9, rb=0.2, rf=0.12, lean=(0.3, -0.12), bark=0x4f4540, limbs=3,
                      crown=((0.3, 5.6, -0.1), (2.65, 1.05, 2.65)), clumps=21, card=2.6, seed=13),
    'palo': dict(fork=3.4, rb=0.24, rf=0.16, lean=(0.0, 0.0), bark=0x6f7a55, limbs=3, bottle=True,
                 crown=((0.0, 5.45, 0.0), (1.85, 1.35, 1.85)), clumps=17, card=2.4, seed=14),
}
WHITEWASH = 0xe2e2da
CAL = 1.05  # hasta dónde llega la cal


def tree(name, sp):
    rnd = random.Random(sp['seed'])
    bark = lin(hexc(sp['bark']))
    (cx, cy, cz), (rx, ry, rz) = sp['crown']
    C = Vector((cx, cy, cz))
    fork = Vector((sp['lean'][0], sp['fork'], sp['lean'][1]))
    # ---- ramilletes: en espiral por la cáscara de la copa (más arriba que abajo) y dos adentro ----
    clumps = []
    n = sp['clumps']
    golden = math.pi * (3 - math.sqrt(5))
    ymin = -0.5
    for i in range(n):
        yu = 1 - (i + 0.5) / n * (1 - ymin)
        r = math.sqrt(max(0, 1 - yu * yu))
        th = i * golden + rnd.uniform(-0.25, 0.25)
        d = Vector((r * math.cos(th), yu, r * math.sin(th)))
        f = rnd.uniform(0.72, 0.95)
        clumps.append(C + Vector((d.x * rx * f, d.y * ry * f, d.z * rz * f)))
    for k in range(3):
        th = k * 2 * math.pi / 3 + rnd.uniform(-0.4, 0.4)
        clumps.append(C + Vector((math.cos(th) * rx * 0.35, -ry * 0.1, math.sin(th) * rz * 0.35)))
    # ---- tronco ----
    T = Part(f'tronco_{name}')
    if sp.get('bottle'):
        ys = [0, 0.22, CAL, 1.9, 2.6, sp['fork']]
        rs = [0.27, 0.31, 0.42, 0.43, 0.32, sp['rf']]
        sides = 8
    else:
        ys = [0, 0.22, CAL, sp['fork'] * 0.6, sp['fork']]
        rs = [sp['rb'] * 1.5, sp['rb'] * 1.12, sp['rb'], (sp['rb'] + sp['rf']) / 2, sp['rf']]
        sides = 7
    pts = [Vector((fork.x * (y / sp['fork']) ** 1.5, y, fork.z * (y / sp['fork']) ** 1.5)) for y in ys]
    T.tube(pts, rs, sides, bark, cap=True)
    # ---- ramas maestras: cada una hacia un sector de la copa ----
    limbs = []
    az0 = rnd.uniform(0, 2 * math.pi)
    for k in range(sp['limbs']):
        az = az0 + k * 2 * math.pi / sp['limbs'] + rnd.uniform(-0.3, 0.3)
        spread = rx * rnd.uniform(0.45, 0.6)
        end = Vector((cx + math.cos(az) * spread, cy - ry * rnd.uniform(0.05, 0.3), cz + math.sin(az) * spread))
        start = fork - Vector((0, 0.35, 0))
        mid = start.lerp(end, 0.45) + Vector((0, (end.y - start.y) * 0.25, 0))
        r0 = sp['rf'] * 0.72
        T.tube([start, mid, end], [r0, r0 * 0.7, r0 * 0.38], 5, bark, cap=True)
        limbs.append((az, start, mid, end, r0))
    # ---- ramitas: de la rama maestra más cerca a cada ramillete de la mitad de abajo (los de arriba
    # quedan tapados por las hojas) ----
    for p in clumps:
        if p.y > cy + ry * 0.3:
            continue
        az = math.atan2(p.z - cz, p.x - cx)
        az_l, start, mid, end, r0 = min(limbs, key=lambda l: abs(math.atan2(math.sin(az - l[0]), math.cos(az - l[0]))))
        a = mid.lerp(end, rnd.uniform(0.4, 0.9))
        T.tube([a, p], [r0 * 0.34, r0 * 0.12], 3, bark)
    trunk = T.done()
    # ---- copa: tres hojas cruzadas por ramillete ----
    K = Part(f'copa_{name}', uv=True)
    up = Vector((0, 1, 0))
    R = max(rx, ry * 1.4, rz)
    shade = []
    for p in clumps:
        rad = Vector(((p.x - cx) / rx, (p.y - cy) / ry, (p.z - cz) / rz))
        d = rad.normalized() if rad.length > 1e-3 else up.copy()
        side = d.cross(up)
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        rnd_v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        normals = [d, (up + rnd_v * 0.35).normalized(), side]
        for nn in normals:
            right = nn.cross(rnd_v if abs(nn.dot(rnd_v.normalized())) < 0.9 else Vector((0, 0, 1)))
            right.normalize()
            vv = nn.cross(right).normalized()
            s = sp['card'] * rnd.uniform(0.85, 1.12) / 2
            u0 = 0.5 * rnd.randrange(2)
            flip = rnd.random() < 0.5
            corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
            vs = []
            uvs = []
            for a, b in corners:
                q = p + right * (a * s) + vv * (b * s)
                # normal de copa redonda: la del ramillete y la de toda la copa
                n1 = (q - p) / s * 0.55 + (q - C) / R * 0.45 + Vector((0, 0.12, 0))
                vs.append(K.v(q, n1.normalized()))
                # lo de adentro y lo de abajo más oscuro
                e = Vector(((q.x - cx) / rx, (q.y - cy) / ry, (q.z - cz) / rz)).length
                hgt = min(1, max(0, (q.y - (cy - ry)) / (2 * ry)))
                shade.append(min(1, (0.5 + 0.5 * min(1, max(0, (e - 0.25) / 0.85))) * (0.82 + 0.18 * hgt)))
                uu = (a + 1) / 2
                uvs.append((u0 + 0.5 * (1 - uu if flip else uu), (b + 1) / 2))
            K.face(vs, (1, 1, 1), uvs, smooth=True)
    crown = K.done()
    return trunk, crown, shade


def bake_ao(ob, others):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 1.2
    for o in others:
        o.hide_render = True
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = [0.45 + 0.55 * d.color[0] for d in ca.data]
    me.color_attributes.remove(ca)
    for o in others:
        o.hide_render = False
    return ao


if os.environ.get('SIN_HOJAS') != '1':
    leaf_textures()
os.makedirs(os.path.dirname(GLB), exist_ok=True)
out = []
for name, sp in SPECIES.items():
    trunk, crown, shade = tree(name, sp)
    out.append((trunk, crown))
    # copa: solo la sombra de adentro (el verde lo pone la textura)
    me = crown.data
    ca = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for loop in me.loops:
        k = shade[loop.vertex_index]
        ca.data[loop.index].color = (k, k, k, 1)
    me.color_attributes.active_color = ca
bpy.ops.mesh.primitive_plane_add(size=20)
floor = bpy.context.active_object
trunks = [t for t, _ in out]
crowns = [c for _, c in out]
final = []
for t in trunks:
    name = t.name.split('_', 1)[1]
    ao = bake_ao(t, [o for o in trunks + crowns if o is not t])
    bark = lin(hexc(SPECIES[name]['bark']))
    white = lin(hexc(WHITEWASH))
    # pintado: copia con la cal en las caras de abajo
    tp = t.copy()
    tp.data = t.data.copy()
    tp.name = tp.data.name = f'tronco_{name}_pintado'
    scene.collection.objects.link(tp)

    def low(poly, me=t.data):
        return sum(me.vertices[i].co.z for i in poly.vertices) / len(poly.vertices) < CAL

    # el tronco se oscurece un poco abajo (tierra, humedad) y es más claro arriba
    def bark_col(poly, me=t.data):
        z = sum(me.vertices[i].co.z for i in poly.vertices) / len(poly.vertices)
        return mul(bark, 0.82 + 0.18 * min(1, z / 2.5))

    set_colors(t, bark_col, ao)
    set_colors(tp, lambda poly, me=tp.data: white if low(poly, me) else bark_col(poly, me), ao)
    final += [t, tp]
bpy.data.objects.remove(floor)
final += crowns
for ob in scene.objects:
    ob.select_set(ob in final)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True, export_materials='NONE')
for ob in final:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB)
