# Palmera hecha en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/palmera.py
# Sale:
#   public/textures/palmera_hoja.webp  una hoja (fronda) modelada con su nervio y 128 folíolos, vista
#                                      desde arriba con fondo transparente: se usa recortada en la copa.
#   public/models/trees/palmera.glb    tronco con la base ancha y la copa: 12 hojas en dos pisos, con un
#                                      pliegue en V a lo largo del nervio, que suben y caen. ~400
#                                      triángulos en total (hay ~1.400 palmeras en el mapa), con la sombra
#                                      de la copa horneada en los colores de vértice.
# El tronco usa la textura de anillos que ya dibuja src/palms.js (u a lo largo, v alrededor).
import math
import os
import random

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'trees', 'palmera.glb')
LEAF = os.path.join(ROOT, 'public', 'textures', 'palmera_hoja.webp')
rnd = random.Random(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


# ---------- 1. La hoja, renderizada como textura ----------
def leaf_texture():
    # hoja de 1 m de ancho x 4 m de largo (x a lo ancho, y a lo largo, de 0 a 4)
    bm = bmesh.new()
    rachis = [(0, y * 0.25, 0) for y in range(17)]
    for a, b in zip(rachis, rachis[1:]):
        w = 0.035 * (1 - a[1] / 4.2)
        v = [bm.verts.new((a[0] - w, a[1], 0)), bm.verts.new((a[0] + w, a[1], 0)), bm.verts.new((b[0] + w * 0.9, b[1], 0)), bm.verts.new((b[0] - w * 0.9, b[1], 0))]
        bm.faces.new(v)
    n = 64
    for side in (-1, 1):
        for i in range(n):
            t = (i + 0.5) / n
            y0 = 0.25 + t * 3.7
            # largo del folíolo: corto en la base y en la punta, largo en el medio
            L = 0.47 * math.sin(math.pi * min(1, t * 1.1)) ** 0.6 + 0.06
            ang = math.radians(rnd.uniform(42, 55))
            tip = (side * L * math.sin(ang), y0 + L * math.cos(ang))
            w = 0.045 + 0.015 * rnd.random()  # anchos: finitos desaparecían de lejos
            base_l = (side * 0.02, y0 - w)
            base_r = (side * 0.02, y0 + w)
            mid = (side * L * 0.5 * math.sin(ang), y0 + L * 0.5 * math.cos(ang))
            vs = [bm.verts.new((*p, 0.001 * i)) for p in (base_l, (mid[0] + side * 0.0, mid[1] - w * 0.9), tip, (mid[0], mid[1] + w * 0.9), base_r)]
            bm.faces.new(vs if side > 0 else list(reversed(vs)))
    ob = link('hoja', bm)
    # color: verde con folíolos de tono un poco distinto y puntas más amarillas
    ca = ob.data.color_attributes.new('c', 'BYTE_COLOR', 'CORNER')
    for poly in ob.data.polygons:
        g = rnd.uniform(0.85, 1.12)
        for li in poly.loop_indices:
            y = ob.data.vertices[ob.data.loops[li].vertex_index].co.y
            k = min(1.0, y / 4)
            col = (0.2 * g + 0.14 * k, 0.5 * g + 0.08 * k, 0.13 * g, 1)
            ca.data[li].color = col
    ob.data.color_attributes.active_color = ca
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 4.0
    cam.location = (0, 2.0, 5)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.light = 'FLAT'
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = 128, 512
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    tmp = LEAF.replace('.webp', '.png')
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    im = Image.open(tmp).convert('RGBA')
    # el borde transparente toma el color de la hoja (si no, el filtrado lo oscurece)
    rgb = im.convert('RGB').resize((1, 1)).getpixel((0, 0))
    bg = Image.new('RGBA', im.size, (*rgb, 0))
    bg.alpha_composite(im)
    bg.save(LEAF, 'WEBP', quality=90, exact=True)
    os.remove(tmp)
    for o in (ob, cam):
        bpy.data.objects.remove(o)


# ---------- 2. La palmera ----------
def trunk_point(t):
    # tronco curvo de 6,3 m que se inclina hacia +x (igual que el de antes)
    return Vector((0.95 * t ** 1.6, 0, 6.3 * t))


def trunk(bm, uv):
    rings, segs, sides = [], 14, 6
    for s in range(segs + 1):
        t = s / segs
        r = 0.16 + 0.16 * max(0, 1 - t * 9) ** 2 - 0.03 * t  # base ancha que se angosta
        c = trunk_point(t)
        rings.append([bm.verts.new(c + Vector((r * math.cos(a), r * math.sin(a), 0))) for a in (2 * math.pi * i / sides for i in range(sides))])
    for s in range(segs):
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]))
            for loop, (u, v) in zip(f.loops, ((s / segs, i / sides), (s / segs, (i + 1) / sides), ((s + 1) / segs, (i + 1) / sides), ((s + 1) / segs, i / sides))):
                loop[uv].uv = (u, v)  # (la textura de anillos se repite 6 veces a lo largo: repeat de palms.js)


def frond(bm, uv, base, yaw, pitch, length, droop):
    # tira de 5 tramos con pliegue en V: el nervio al medio y las dos mitades levantadas
    segs = 5
    dirh = Vector((math.cos(yaw), math.sin(yaw), 0))
    side = Vector((-math.sin(yaw), math.cos(yaw), 0))
    pts = []
    for s in range(segs + 1):
        t = s / segs
        d = length * t
        z = math.sin(pitch) * d - droop * t * t * length
        pts.append(base + dirh * (math.cos(pitch) * d) + Vector((0, 0, z)))
    rows = []
    for s, p in enumerate(pts):
        t = s / segs
        half = 0.5 * (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.15 + 0.08)))
        lift = Vector((0, 0, 0.16 * half))
        rows.append([bm.verts.new(p - side * half + lift), bm.verts.new(p), bm.verts.new(p + side * half + lift)])
    for s in range(segs):
        for k in range(2):
            f = bm.faces.new((rows[s][k], rows[s][k + 1], rows[s + 1][k + 1], rows[s + 1][k]))
            for loop, (u, v) in zip(f.loops, ((k / 2, s / segs), ((k + 1) / 2, s / segs), ((k + 1) / 2, (s + 1) / segs), (k / 2, (s + 1) / segs))):
                loop[uv].uv = (u, v)


def palm():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    trunk(bm, uv)
    tr = link('tronco', bm)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    top = trunk_point(1) + Vector((0, 0, 0.05))
    # piso de arriba: 7 hojas que suben y se arquean; piso de abajo: 5 que caen más
    for i in range(7):
        frond(bm, uv, top, i / 7 * 2 * math.pi + rnd.uniform(-0.15, 0.15), math.radians(rnd.uniform(28, 40)), rnd.uniform(3.2, 3.8), rnd.uniform(0.45, 0.6))
    for i in range(5):
        frond(bm, uv, top - Vector((0, 0, 0.12)), (i + 0.5) / 5 * 2 * math.pi + rnd.uniform(-0.2, 0.2), math.radians(rnd.uniform(-5, 8)), rnd.uniform(2.8, 3.3), rnd.uniform(0.7, 0.9))
    cr = link('copa', bm)
    return tr, cr


def bake_ao(objs):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 1.5
    bpy.ops.mesh.primitive_plane_add(size=12)
    floor = bpy.context.active_object
    for ob in objs:
        me = ob.data
        if not me.materials:
            me.materials.append(bpy.data.materials.new(ob.name))
        ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        # las hojas son de un solo lado: la AO de dos caras sale de más; se aclara un poco
        for d in ca.data:
            k = 0.62 + 0.38 * d.color[0]
            d.color = (k, k, k, 1)
    bpy.data.objects.remove(floor)


os.makedirs(os.path.dirname(GLB), exist_ok=True)
leaf_texture()
tr, cr = palm()
bake_ao([tr, cr])
for ob in scene.objects:
    ob.select_set(ob.name in ('tronco', 'copa'))
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True, export_materials='NONE')
total = 0
for name in ('tronco', 'copa'):
    me = bpy.data.objects[name].data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    total += tris
    print(f'{name}: {tris} triángulos')
print(f'total {total}; listo:', GLB, LEAF)
