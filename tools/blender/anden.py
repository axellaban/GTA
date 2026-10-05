# Kit de los andenes de la estación (Ferrocarril del Sud) hecho en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/anden.py
# Sale:
#   public/models/station/anden.glb   columna de hierro fundido (base, fuste estriado, capitel y cuatro
#                                     ménsulas caladas) y un tramo de 2 m de la puntilla de madera (50 cm) del
#                                     borde del techo. La sombra de contacto (oclusión ambiental) va
#                                     horneada en los colores de vértice: no suma texturas.
#   public/textures/chapa_normal.webp relieve de la chapa acanalada del techo (horneado de una chapa
#                                     de verdad, con ondas, sobre un plano), se repite cada 1 m.
# Medidas: el andén está a 1,1 m y el techo a 4,9 m, así que la columna mide 3,8 m (origen en la base).
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'station', 'anden.glb')
NORMAL = os.path.join(ROOT, 'public', 'textures', 'chapa_normal.webp')
H = 3.8  # del piso del andén al techo

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def ring(bm, r_of, z, n):
    return [bm.verts.new((r_of(i) * math.cos(2 * math.pi * i / n), r_of(i) * math.sin(2 * math.pi * i / n), z)) for i in range(n)]


def loft(bm, rings, cap_top=False, cap_bottom=False):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])


def box(bm, sx, sy, z0, z1):
    out = []
    for z in (z0, z1):
        out.append([bm.verts.new((x, y, z)) for x, y in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy))])
    loft(bm, out, cap_top=True, cap_bottom=True)


def column():
    bm = bmesh.new()
    box(bm, 0.15, 0.15, 0.0, 0.2)  # dado de la base
    # moldura de la base y fuste estriado (16 caras: 8 estrías)
    fl = lambda i: 0.085 if i % 2 == 0 else 0.072
    loft(bm, [ring(bm, lambda i: 0.13, 0.2, 16), ring(bm, lambda i: 0.11, 0.27, 16), ring(bm, fl, 0.3, 16), ring(bm, fl, 3.22, 16), ring(bm, lambda i: 0.1, 3.25, 16), ring(bm, lambda i: 0.1, 3.3, 16)])
    # capitel: se abre hacia arriba
    loft(bm, [ring(bm, lambda i: 0.09, 3.3, 12), ring(bm, lambda i: 0.17, 3.5, 12)], cap_top=True)
    box(bm, 0.18, 0.18, 3.5, 3.56)  # ábaco
    box(bm, 0.11, 0.11, 3.56, H)  # dado que recibe la viga del techo
    ob = mesh_object('columna', bm)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    ob.select_set(False)
    parts = [ob]
    # cuatro ménsulas de hierro: un arco de cuarto de elipse del fuste al techo, la barra de arriba
    # y una voluta (espiral) en el rincón
    for k in range(4):
        a = k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        to3 = lambda x, z: (x * ca, x * sa, z)
        arc = [to3(0.7 - 0.62 * math.cos(t), 2.95 + 0.83 * math.sin(t)) for t in (j * math.pi / 2 / 8 for j in range(9))]
        top = [to3(0.08, H - 0.03), to3(0.74, H - 0.03)]
        spiral = []
        for j in range(14):
            t = j / 13 * math.pi * 2.2
            r = 0.13 * (1 - j / 16)
            spiral.append(to3(0.27 + r * math.cos(t), 3.52 + r * math.sin(t)))
        for pts in (arc, top, spiral):
            parts.append(tube(pts))
    # todo en una sola malla
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    return ob


def tube(pts):
    cu = bpy.data.curves.new('m', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.022
    cu.bevel_resolution = 0
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    ob = bpy.data.objects.new('m', cu)
    scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return bpy.context.view_layer.objects.active


def valance():
    # tramo de 2 m de puntilla: tabla con el borde de abajo en dientes, colgada del borde del techo
    L, T = 2.0, 0.014
    teeth = 10
    outline = [(-L / 2, 0.0), (L / 2, 0.0)]
    for i in range(teeth, 0, -1):
        x1 = -L / 2 + i * L / teeth
        x0 = x1 - L / teeth
        outline += [(x1, -0.34), ((x0 + x1) / 2, -0.5), (x0, -0.34)]
    bm = bmesh.new()
    front = [bm.verts.new((x, -T / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, T / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((front[(i + 1) % n], front[i], back[i], back[(i + 1) % n]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # listón de arriba, un poco más grueso
    box_v = []
    for y in (-T * 1.6, T * 1.6):
        box_v.append([bm.verts.new((x, y, z)) for x, z in ((-L / 2, -0.12), (L / 2, -0.12), (L / 2, 0.0), (-L / 2, 0.0))])
    loft(bm, box_v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_object('puntilla', bm)
    # una tabla tan fina no se puede hornear (sale negra): sombra a mano, más oscura pegada al techo
    me = ob.data
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    for loop in me.loops:
        z = me.vertices[loop.vertex_index].co.z
        k = 0.7 + 0.3 * min(1.0, -z / 0.5)
        ca.data[loop.index].color = (k, k, k, 1.0)
    me.color_attributes.active_color = ca
    return ob


def bake_ao(objs):
    # piso del andén y techo para que la sombra de contacto salga donde corresponde
    helpers = []
    for z, s in ((0.0, 3), (H, 3)):
        bpy.ops.mesh.primitive_plane_add(size=s * 2, location=(0, 0, z))
        helpers.append(bpy.context.active_object)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 96
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.6
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
    for h in helpers:
        bpy.data.objects.remove(h)


def bake_corrugated():
    # chapa acanalada: 13 ondas por metro (cada 7,7 cm), así el relieve se repite sin costura
    W = 13
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=8, y_subdivisions=W * 16, size=1)
    hi = bpy.context.active_object
    for v in hi.data.vertices:
        v.co.z = 0.009 * math.sin(2 * math.pi * W * (v.co.y + 0.5))
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_plane_add(size=1)
    lo = bpy.context.active_object
    img = bpy.data.images.new('chapa', 256, 256, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new('chapa')
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    mat.node_tree.nodes.active = node
    lo.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    scene.cycles.samples = 16
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.03, normal_space='TANGENT', margin=0)
    tmp = NORMAL.replace('.webp', '.png')
    img.filepath_raw = tmp
    img.file_format = 'PNG'
    img.save()
    Image.open(tmp).convert('RGB').save(NORMAL, 'WEBP', quality=92)
    os.remove(tmp)
    for ob in (hi, lo):
        bpy.data.objects.remove(ob)


os.makedirs(os.path.dirname(GLB), exist_ok=True)
col = column()
val = valance()
bake_ao([col])
bake_corrugated()
for ob in scene.objects:
    ob.select_set(ob.name in ('columna', 'puntilla'))
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
for name in ('columna', 'puntilla'):
    me = bpy.data.objects[name].data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    print(f'{name}: {tris} triángulos')
print('listo:', GLB, NORMAL)
