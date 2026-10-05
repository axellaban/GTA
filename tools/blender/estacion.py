# Molduras de la estación (Ferrocarril del Sud) hechas en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/estacion.py
# Sale public/models/station/fachada.glb con piezas que src/estacion-kit.js repite por las paredes
# del edificio, encima de los arcos que ya están pintados en la textura (drawEstacion en textures.js):
#   arco     arquivolta de medio punto con clave e impostas, para un vano de 1 m de ancho (arranca
#            en y = 0; el juego la escala con el ancho de cada ventana)
#   jambas   las dos jambas del vano, de 1 m de alto (el juego las estira hasta el alféizar)
#   alfeizar el alféizar de abajo
#   cornisa  tramo de 2 m de cornisa con su perfil (faja, gola y corona), de 0,65 m de alto
#   guarda   tramo de 2 m de la guarda entre pisos
#   zocalo   tramo de 2 m del zócalo
# x a lo largo de la pared, y para arriba y +z hacia afuera (en coordenadas del juego). La sombra de
# contacto va horneada en los colores de vértice; el color crema lo pone el material del juego.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'station', 'fachada.glb')

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


def extrude_profile(bm, profile, x0, x1):
    # perfil en (y, z) barrido a lo largo de x, con tapas en las puntas
    a = [bm.verts.new(B(x0, y, z)) for y, z in profile]
    b = [bm.verts.new(B(x1, y, z)) for y, z in profile]
    for i in range(len(profile) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))


def box(bm, x0, x1, y0, y1, z0, z1):
    v = [bm.verts.new(B(x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in f])


# moldura: un escalón y un filete (en z hacia afuera de la pared)
MOLD = [(0.0, 0.0), (0.0, 0.035), (0.04, 0.035), (0.04, 0.06), (0.14, 0.06), (0.14, 0.0)]


def arch():
    bm = bmesh.new()
    r0, n = 0.5, 12
    rings = []
    for i in range(n + 1):
        t = math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        rings.append([bm.verts.new(B(c * (r0 + w), s * (r0 + w), z)) for w, z in MOLD])
    for a, b in zip(rings, rings[1:]):
        for k in range(len(MOLD) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    # clave: trapecio que sobresale arriba al medio
    k0, k1 = 0.07, 0.11
    top = r0 + 0.22
    pts = [(-k0, r0 - 0.02), (k0, r0 - 0.02), (k1, top), (-k1, top)]
    f = [bm.verts.new(B(x, y, 0.09)) for x, y in pts]
    b = [bm.verts.new(B(x, y, 0.0)) for x, y in pts]
    bm.faces.new(f)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((f[i], b[i], b[j], f[j]))
    # impostas: dados donde arranca el arco
    for sx in (-1, 1):
        box(bm, sx * 0.5 - 0.06 if sx > 0 else -0.5 - 0.1, sx * 0.5 + 0.1 if sx > 0 else -0.5 + 0.06, -0.06, 0.03, 0.0, 0.08)
    return link('arco', bm)


def jambs():
    bm = bmesh.new()
    for sx in (-1, 1):
        prof = [(sx * (0.5 + w), z) for w, z in MOLD]
        a = [bm.verts.new(B(x, -1.0, z)) for x, z in prof]
        b = [bm.verts.new(B(x, 0.0, z)) for x, z in prof]
        for i in range(len(prof) - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    return link('jambas', bm)


def sill():
    bm = bmesh.new()
    box(bm, -0.66, 0.66, -0.08, 0.0, 0.0, 0.12)
    box(bm, -0.56, 0.56, -0.16, -0.08, 0.0, 0.07)  # repisa de abajo
    return link('alfeizar', bm)


def cornice():
    bm = bmesh.new()
    # (y, z): faja, gola y corona; arriba vuelve a la pared (lo tapa el alero del techo)
    prof = [(0.0, 0.0), (0.0, 0.05), (0.18, 0.05), (0.22, 0.09), (0.34, 0.11), (0.42, 0.2), (0.48, 0.3), (0.52, 0.34), (0.65, 0.34), (0.65, 0.0)]
    extrude_profile(bm, prof, -1.0, 1.0)
    return link('cornisa', bm)


def band():
    bm = bmesh.new()
    extrude_profile(bm, [(-0.12, 0.0), (-0.12, 0.04), (-0.06, 0.07), (0.06, 0.07), (0.1, 0.04), (0.12, 0.0)], -1.0, 1.0)
    return link('guarda', bm)


def plinth():
    bm = bmesh.new()
    extrude_profile(bm, [(0.0, 0.0), (0.0, 0.07), (0.38, 0.07), (0.45, 0.03), (0.45, 0.0)], -1.0, 1.0)
    return link('zocalo', bm)


def bake_ao(objs):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.25
    for i, ob in enumerate(objs):
        # una pared detrás de cada pieza para que la sombra de contacto salga contra la fachada;
        # cada pieza lejos de las otras
        ob.location.x += i * 6
        bpy.ops.mesh.primitive_plane_add(size=4, location=(ob.location.x, 0, 0), rotation=(math.pi / 2, 0, 0))
        wall_ob = bpy.context.active_object
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
        bpy.data.objects.remove(wall_ob)
        ob.location.x -= i * 6


os.makedirs(os.path.dirname(GLB), exist_ok=True)
parts = [arch(), jambs(), sill(), cornice(), band(), plinth()]
bake_ao(parts)
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB)
