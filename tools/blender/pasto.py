# Matas de pasto y yuyos de los terrenos hechas en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/pasto.py
# Sale public/textures/pasto_matas.webp (1024x256): cuatro matas modeladas hoja por hoja y renderizadas en
# Cycles de costado, con fondo transparente, una en cada cuarto (de 0,8 x 0,8 m; la base abajo):
#   0  pasto verde (hojas finas que se arquean)
#   1  yuyos: rosetas de hojas anchas, dientes de león amarillos y flores de trébol blancas
#   2  pasto seco alto con espigas (el de los baldíos)
#   3  trébol bajo con flores blancas
# src/pasto.js las pone en tarjetas cruzadas alrededor de la cámara.
import math
import os
import random

import bpy  # tiene que ir antes que bmesh
import bmesh
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'public', 'textures', 'pasto_matas.webp')
SIZE = 0.8  # lado de cada cuarto, en metros

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


class Flat:
    # polígonos con un color por cara (coordenadas de Blender: z arriba; la cámara mira hacia +y)
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


def vary(rnd, c, amt=0.12, warm=0.0):
    k = rnd.uniform(1 - amt, 1 + amt)
    w = rnd.uniform(0, warm)
    return (min(1, c[0] * k + w), min(1, c[1] * k + w * 0.7), c[2] * k)


def blade(F, rnd, base, h, w, col, bend):
    # hoja de pasto: tira que se afina y se arquea hacia un costado (en el plano que mira a la cámara)
    ang = rnd.uniform(0, 2 * math.pi)
    dirv = Vector((math.cos(ang), math.sin(ang), 0))
    side = Vector((-math.sin(ang), math.cos(ang), 0))
    segs = 4
    pts = []
    for i in range(segs + 1):
        t = i / segs
        p = Vector(base) + Vector((0, 0, h * t)) + dirv * (bend * h * t * t)
        p.z -= bend * h * 0.35 * t * t
        pts.append(p)
    for i in range(segs):
        a, b = pts[i], pts[i + 1]
        wa = w * (1 - i / segs)
        wb = w * (1 - (i + 1) / segs) + 0.0015
        F.poly([a - side * wa, a + side * wa, b + side * wb, b - side * wb], vary(rnd, col, 0.06, 0.02 * i))


def leaf_ellipse(F, rnd, c, L, W, ang, tilt, col, z=0.0):
    # hoja ancha acostada (roseta): elipse de 8 lados, apenas levantada en la punta
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(8):
        t = 2 * math.pi * i / 8
        u = (math.cos(t) + 1) / 2 * L
        v = math.sin(t) * W / 2 * max(0.0, math.sin(math.pi * u / L)) ** 0.6
        pts.append((c[0] + ca * u - sa * v, c[1] + sa * u + ca * v, c[2] + z + tilt * u))
    F.poly(pts, col)


def flower(F, rnd, c, r, col, center=None):
    # flor vista de costado y un poco de arriba: un disco de 8 lados inclinado
    pts = [(c[0] + r * math.cos(2 * math.pi * i / 8), c[1] + r * 0.45 * math.sin(2 * math.pi * i / 8), c[2] + r * 0.6 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
    F.poly(pts, col)
    if center:
        F.poly([(c[0] + r * 0.35 * math.cos(2 * math.pi * i / 6), c[1] - 0.003, c[2] + r * 0.35 * math.sin(2 * math.pi * i / 6)) for i in range(6)], center)


def stem(F, a, b, w, col):
    F.poly([(a[0] - w, a[1], a[2]), (a[0] + w, a[1], a[2]), (b[0] + w, b[1], b[2]), (b[0] - w, b[1], b[2])], col)


def tuft(kind, seed):
    rnd = random.Random(seed)
    F = Flat()
    R = 0.3  # radio de la mata
    if kind == 0:
        for _ in range(150):
            r = R * math.sqrt(rnd.random())
            a = rnd.uniform(0, 2 * math.pi)
            blade(F, rnd, (r * math.cos(a), r * math.sin(a), 0), rnd.uniform(0.18, 0.42) * (1 - 0.5 * r / R), rnd.uniform(0.006, 0.01), (0.33, 0.55, 0.2), rnd.uniform(0.15, 0.5))
    elif kind == 1:
        for _ in range(55):
            r = R * math.sqrt(rnd.random())
            a = rnd.uniform(0, 2 * math.pi)
            blade(F, rnd, (r * math.cos(a), r * math.sin(a), 0), rnd.uniform(0.12, 0.3), 0.007, (0.36, 0.56, 0.22), rnd.uniform(0.2, 0.5))
        for k in range(3):
            c = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0.0)
            for i in range(9):
                leaf_ellipse(F, rnd, c, rnd.uniform(0.11, 0.17), 0.05, 2 * math.pi * i / 9 + rnd.uniform(-0.2, 0.2), rnd.uniform(0.15, 0.45), vary(rnd, (0.25, 0.45, 0.16), 0.1), z=0.01 * k)
        for _ in range(7):
            x, y = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.2)
            top = rnd.uniform(0.16, 0.34)
            stem(F, (x, y, 0), (x + rnd.uniform(-0.04, 0.04), y, top), 0.004, (0.32, 0.48, 0.2))
            flower(F, rnd, (x, y - 0.01, top), 0.03, (0.98, 0.82, 0.12), center=(0.95, 0.65, 0.08))
        for _ in range(5):
            x, y = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.2)
            top = rnd.uniform(0.08, 0.16)
            stem(F, (x, y, 0), (x, y, top), 0.003, (0.32, 0.5, 0.2))
            flower(F, rnd, (x, y - 0.01, top), 0.018, (0.96, 0.95, 0.9))
    elif kind == 2:
        for _ in range(110):
            r = R * math.sqrt(rnd.random())
            a = rnd.uniform(0, 2 * math.pi)
            h = rnd.uniform(0.3, 0.62) * (1 - 0.4 * r / R)
            dry = rnd.random()
            col = (0.5 + 0.14 * dry, 0.54 + 0.05 * dry, 0.26) if rnd.random() < 0.5 else (0.38, 0.52, 0.2)
            blade(F, rnd, (r * math.cos(a), r * math.sin(a), 0), h, rnd.uniform(0.005, 0.008), col, rnd.uniform(0.05, 0.25))
        for _ in range(14):
            x, y = rnd.uniform(-0.22, 0.22), rnd.uniform(-0.2, 0.2)
            top = rnd.uniform(0.45, 0.72)
            stem(F, (x, y, 0), (x + rnd.uniform(-0.05, 0.05), y, top), 0.0035, (0.62, 0.6, 0.38))
            leaf_ellipse(F, rnd, (x - 0.01, y - 0.005, top - 0.02), 0.09, 0.025, math.pi / 2 + rnd.uniform(-0.3, 0.3), 0.0, (0.7, 0.66, 0.42))
    else:
        for _ in range(60):
            c = (rnd.uniform(-0.28, 0.28), rnd.uniform(-0.25, 0.25), 0.0)
            top = rnd.uniform(0.03, 0.12)
            stem(F, c, (c[0], c[1], top), 0.0025, (0.3, 0.5, 0.2))
            for i in range(3):
                a = 2 * math.pi * i / 3 + rnd.uniform(-0.2, 0.2)
                leaf_ellipse(F, rnd, (c[0], c[1], top), 0.04, 0.035, a, rnd.uniform(-0.1, 0.25), vary(rnd, (0.24, 0.48, 0.2), 0.12))
        for _ in range(9):
            x, y = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.2)
            top = rnd.uniform(0.1, 0.18)
            stem(F, (x, y, 0), (x, y, top), 0.003, (0.3, 0.5, 0.2))
            flower(F, rnd, (x, y - 0.01, top), 0.022, (0.97, 0.96, 0.92), center=(0.9, 0.85, 0.7))
    return F.done(f'mata{kind}')


def render():
    from PIL import Image
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('cielo')
    scene.world = world
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.88, 1.0, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sun.data.energy = 2.4
    sun.rotation_euler = Vector((-0.3, -0.5, 1.0)).normalized().to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = SIZE
    # de costado, apenas desde arriba (la mata se ve desde la altura de los ojos, a unos metros)
    cam.location = (0, -3.0, SIZE / 2 + 0.25)
    cam.rotation_euler = (math.radians(85), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    mat = bpy.data.materials.new('mata')
    nt = mat.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'col'
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(attr.outputs['Color'], dif.inputs['Color'])
    nt.links.new(dif.outputs['BSDF'], out.inputs['Surface'])
    tmp = TEX.replace('.webp', '.png')
    cells = []
    for kind in range(4):
        ob = tuft(kind, 40 + kind)
        ob.data.materials.append(mat)
        # la base de la mata, al borde de abajo de la imagen
        ob.location.z = 0.0
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        cells.append(np.array(Image.open(tmp).convert('RGBA')).astype(np.float64))
        bpy.data.objects.remove(ob)
    os.remove(tmp)
    im = np.concatenate(cells, axis=1)
    # el color debajo de lo transparente: un verde promedio (si no, el filtrado oscurece los bordes)
    a = im[..., 3:4] / 255
    avg = (im[..., :3] * a).sum((0, 1)) / max(1, a.sum())
    hole = im[..., 3] < 250
    im[..., :3] = np.where(hole[..., None], im[..., :3] * a + avg * (1 - a), im[..., :3])
    Image.fromarray(im.clip(0, 255).astype(np.uint8), 'RGBA').save(TEX, 'WEBP', quality=88, exact=True)
    print('pasto_matas.webp:', f'{(im[..., 3] > 127).mean():.0%} cubierto')


render()
print('listo:', TEX)
