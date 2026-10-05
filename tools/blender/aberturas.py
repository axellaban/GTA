# Marcos de ventanas y puertas hechos en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/aberturas.py
# Sale:
#   public/models/houses/aberturas.glb  piezas de 1 m que src/aberturas-kit.js estira a la medida de cada
#       abertura pintada en las fachadas (el perfil es el mismo a lo largo, así que no se deforma):
#       alfeizar  alféizar con la pendiente para afuera, la nariz redondeada y el goterón abajo (arriba en
#                 y = 0: el borde de abajo de la ventana; de 1 m a lo largo de x)
#       dintel    guardapolvo arriba de la abertura, con una gola (abajo en y = 0)
#       jamba     marco de los costados, de 1 m de alto (de y = 0 a 1; de -0,03 a 0,03 en x)
#       umbral    escalón de granito de la puerta, con la nariz redondeada (de y = 0 a 0,12)
#       persiana  persiana de enrollar a medio bajar: la cortina (con la textura de las tablillas) y la
#                 zapata de abajo (de y = -0,55 a 0; arriba en el borde de arriba de la ventana)
#   public/textures/persiana.webp  las tablillas de PVC modeladas y renderizadas en Cycles, de frente.
# x a lo largo de la pared, y para arriba, +z hacia la calle. Blancas con la sombra de contacto horneada:
# el color de cada abertura lo pone el juego.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'houses', 'aberturas.glb')
TEX = os.path.join(ROOT, 'public', 'textures', 'persiana.webp')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def B(x, y, z):
    return (x, -z, y)  # juego (y arriba) -> Blender (z arriba)


def link(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def sweep_x(bm, prof, x0=-0.5, x1=0.5, caps=True, closed=True):
    # perfil (y, z) barrido a lo largo de x
    a = [bm.verts.new(B(x0, y, z)) for y, z in prof]
    b = [bm.verts.new(B(x1, y, z)) for y, z in prof]
    n = len(prof)
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)


def sweep_y(bm, prof, y0=0.0, y1=1.0):
    # perfil (x, z) abierto (la espalda va contra la pared) barrido a lo largo de y
    a = [bm.verts.new(B(x, y0, z)) for x, z in prof]
    b = [bm.verts.new(B(x, y1, z)) for x, z in prof]
    for i in range(len(prof) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))


# ---------------- piezas ----------------
def alfeizar():
    bm = bmesh.new()
    # (y, z): arriba con pendiente hacia afuera, nariz redondeada, goterón abajo
    prof = [(0.0, 0.0), (-0.012, 0.145), (-0.022, 0.163), (-0.04, 0.17), (-0.058, 0.164), (-0.068, 0.15),
            (-0.07, 0.132), (-0.06, 0.126), (-0.07, 0.118), (-0.07, 0.0)]
    sweep_x(bm, prof)
    return link('alfeizar', bm)


def dintel():
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.0, 0.07), (0.012, 0.075), (0.04, 0.082), (0.07, 0.092), (0.085, 0.095), (0.1, 0.085), (0.105, 0.0)]
    sweep_x(bm, prof)
    return link('dintel', bm)


def jamba():
    bm = bmesh.new()
    sweep_y(bm, [(-0.03, 0.0), (-0.03, 0.028), (-0.018, 0.048), (0.018, 0.048), (0.03, 0.028), (0.03, 0.0)])
    return link('jamba', bm)


def umbral():
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.0, 0.37), (0.012, 0.395), (0.04, 0.405), (0.1, 0.405), (0.12, 0.385), (0.125, 0.0)]
    sweep_x(bm, prof)
    return link('umbral', bm)


def persiana():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    # la cortina: un plano con la textura de las tablillas (u a lo ancho, v de abajo para arriba)
    vs = [bm.verts.new(B(x, y, 0.022)) for x, y in ((-0.5, -0.55), (0.5, -0.55), (0.5, 0.0), (-0.5, 0.0))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    # zapata de aluminio abajo de la cortina (sin textura: la uv cae en una tablilla clara)
    z = [(-0.55, 0.012), (-0.55, 0.04), (-0.585, 0.04), (-0.585, 0.012)]
    sweep_x(bm, [(y, zz) for y, zz in z], caps=True)
    for face in bm.faces:
        if face is not f:
            for loop in face.loops:
                loop[uv].uv = (0.5, 0.97)
    return link('persiana', bm)


# ---------------- textura de las tablillas ----------------
def persiana_texture():
    from PIL import Image
    bm = bmesh.new()
    n = 12
    h = 0.55 / n
    for i in range(n):
        y0 = -0.55 + i * h
        # tablilla abombada: más adelante en el medio, con la ranura entre una y otra
        prof = [(y0 + 0.002, 0.0), (y0 + 0.004, 0.006), (y0 + h * 0.3, 0.011), (y0 + h * 0.65, 0.012), (y0 + h - 0.006, 0.008), (y0 + h - 0.002, 0.0)]
        sweep_x(bm, prof, -0.6, 0.6, caps=False, closed=False)
    ob = link('tablillas', bm)
    for p in ob.data.polygons:
        p.use_smooth = True
    # fondo (lo oscuro que se ve por la ranura)
    bpy.ops.mesh.primitive_plane_add(size=2, location=B(0, -0.275, -0.01), rotation=(math.pi / 2, 0, 0))
    back = bpy.context.active_object
    mat = bpy.data.materials.new('pvc')
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    ob.data.materials.append(mat)
    dark = bpy.data.materials.new('fondo')
    dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1)
    back.data.materials.append(dark)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = 32, 256
    world = bpy.data.worlds.new('cielo')
    scene.world = world
    world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sun.data.energy = 2.0
    # luz de arriba y de adelante (en Blender, -y es la calle)
    sun.rotation_euler = Vector((0.0, -0.6, 1.0)).normalized().to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 0.55
    cam.location = B(0, -0.275, 1.0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    tmp = TEX.replace('.webp', '.png')
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = Image.open(tmp).convert('L')
    # la textura se multiplica por el color de cada persiana: lo más claro, casi blanco
    px = im.load()
    hi = max(px[x, y] for x in range(im.width) for y in range(im.height)) or 1
    im = im.point(lambda v: min(255, int(v * 245 / hi)))
    im.convert('RGB').save(TEX, 'WEBP', quality=90)
    os.remove(tmp)
    for o in (ob, back, sun, cam):
        bpy.data.objects.remove(o)


def bake(ob, occluders):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.2
    occ = []
    for c, s in occluders:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=B(*c))
        o = bpy.context.active_object
        o.scale = (s[0], s[2], s[1])
        occ.append(o)
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for d in ca.data:
        k = 0.55 + 0.45 * d.color[0]
        d.color = (k, k, k, 1)
    for o in occ:
        bpy.data.objects.remove(o)


os.makedirs(os.path.dirname(GLB), exist_ok=True)
persiana_texture()
parts = [alfeizar(), dintel(), jamba(), umbral(), persiana()]
WALL = ((0, 0.5, -0.5), (6, 6, 1.0))  # la pared detrás de todo (de z = -1 a 0)
FLOOR = ((0, -0.5, 0.5), (6, 1.0, 2.0))  # la vereda, debajo del umbral
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    bake(ob, [WALL, FLOOR] if ob.name == 'umbral' else [WALL])
for o in parts:
    o.hide_render = False
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB, TEX)
