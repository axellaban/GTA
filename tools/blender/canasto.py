# Canasto de basura elevado (el de cada casa del conurbano) hecho en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/canasto.py
# Sale:
#   public/textures/canasto.webp      metal desplegado (rombos) modelado y renderizado en Cycles, con fondo
#                                     transparente (se repite cada 25 cm).
#   public/models/street/canasto.glb  canasto_malla: los cuatro lados y el fondo de metal desplegado (con la
#                                     textura); canasto_marco: el marco de hierro (aro de arriba, esquineros y
#                                     fondo), el caño de 1,2 m con su placa y la ménsula. Origen en el centro
#                                     del canasto (como la caja de antes, que src/props.js pone a 1,2 m de la
#                                     vereda). La sombra horneada en los colores de vértice.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'street', 'canasto.glb')
TEX = os.path.join(ROOT, 'public', 'textures', 'canasto.webp')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene



def B(x, y, z):
    return (x, -z, y)  # juego (y arriba) -> Blender (z arriba)


# ---------------- textura: metal desplegado ----------------
def mesh_texture():
    from PIL import Image
    bm = bmesh.new()
    # rombos de 3 x 1,6 cm (en la textura: 0,25 m de ancho por 0,25 de alto, repetida)
    W, H = 0.25, 0.25
    nx, ny = 6, 10
    dx, dy = W / nx, H / ny
    t = 0.0045  # ancho del alambre
    # vértices de los rombos: filas cada dy/2, corridas medio rombo una sí y otra no; de cada vértice salen
    # los dos hilos para arriba (así cada hilo se dibuja una vez)
    for j in range(-1, 2 * ny + 2):
        for i in range(-1, nx + 2):
            px = i * dx + (j % 2) * dx / 2
            py = j * dy / 2
            for sx in (1, -1):
                p0 = (px, py)
                p1 = (px + sx * dx / 2, py + dy / 2)
                L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                nxv, nyv = -(p1[1] - p0[1]) / L * t / 2, (p1[0] - p0[0]) / L * t / 2
                # (el metal desplegado está doblado: los hilos de un lado un poco más adelante)
                z0, z1 = (0.0, 0.003) if sx > 0 else (0.003, 0.0)
                vs = [bm.verts.new((p0[0] + nxv, p0[1] + nyv, z0)), bm.verts.new((p0[0] - nxv, p0[1] - nyv, z0)),
                      bm.verts.new((p1[0] - nxv, p1[1] - nyv, z1)), bm.verts.new((p1[0] + nxv, p1[1] + nyv, z1))]
                bm.faces.new(vs)
    me = bpy.data.meshes.new('malla')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('malla', me)
    scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('hierro')
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.05, 0.055, 0.06, 1)
    bsdf.inputs['Metallic'].default_value = 0.6
    bsdf.inputs['Roughness'].default_value = 0.45
    me.materials.append(mat)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('cielo')
    scene.world = world
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.9, 1.0, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (0.5, 0.3, 0.0)
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = W
    cam.location = (W / 2, H / 2, 1)
    scene.collection.objects.link(cam)
    scene.camera = cam
    tmp = TEX.replace('.webp', '.png')
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = np.array(Image.open(tmp).convert('RGBA')).astype(np.float64)
    os.remove(tmp)
    # el color debajo de lo transparente: el del alambre (si no, el filtrado aclara el borde)
    hole = im[..., 3] < 255
    im[..., :3] = np.where(hole[..., None], np.array([40.0, 43.0, 46.0]), im[..., :3])
    Image.fromarray(im.clip(0, 255).astype(np.uint8), 'RGBA').save(TEX, 'WEBP', quality=90, exact=True)
    for o in (ob, sun, cam):
        bpy.data.objects.remove(o)


# ---------------- el canasto ----------------
IRON = (0.021, 0.024, 0.027)  # hierro pintado de negro (lineal)


class Part:
    def __init__(self, name, uv=False):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap') if uv else None
        self.name = name

    def quad(self, pts, uvs=None):
        f = self.bm.faces.new([self.bm.verts.new(B(*p)) for p in pts])
        if uvs:
            for loop, t in zip(f.loops, uvs):
                loop[self.uv].uv = t
        return f

    def box(self, c, s):
        x, y, z = c
        a, b, d = s[0] / 2, s[1] / 2, s[2] / 2
        P = [(x + i * a, y + j * b, z + k * d) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.quad([P[i] for i in f])

    def tube(self, x, z, y0, y1, r, sides):
        ring0 = [self.bm.verts.new(B(x + r * math.cos(2 * math.pi * k / sides), y0, z + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        ring1 = [self.bm.verts.new(B(x + r * math.cos(2 * math.pi * k / sides), y1, z + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        for k in range(sides):
            j = (k + 1) % sides
            f = self.bm.faces.new((ring0[k], ring0[j], ring1[j], ring1[k]))
            f.smooth = True

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        return ob


W, H, D = 0.62, 0.36, 0.46  # como la caja de antes (0,6 x 0,35 x 0,45)
X0, X1, Y0, Y1, Z0, Z1 = -W / 2, W / 2, -H / 2, H / 2, -D / 2, D / 2


def malla():
    p = Part('canasto_malla', uv=True)
    k = 1 / 0.25  # la textura se repite cada 25 cm

    def side(pts, uw, uh):
        p.quad(pts, [(0, 0), (uw * k, 0), (uw * k, uh * k), (0, uh * k)])

    side([(X0, Y0, Z1), (X1, Y0, Z1), (X1, Y1, Z1), (X0, Y1, Z1)], W, H)
    side([(X1, Y0, Z0), (X0, Y0, Z0), (X0, Y1, Z0), (X1, Y1, Z0)], W, H)
    side([(X1, Y0, Z1), (X1, Y0, Z0), (X1, Y1, Z0), (X1, Y1, Z1)], D, H)
    side([(X0, Y0, Z0), (X0, Y0, Z1), (X0, Y1, Z1), (X0, Y1, Z0)], D, H)
    side([(X0, Y0, Z0), (X1, Y0, Z0), (X1, Y0, Z1), (X0, Y0, Z1)], W, D)
    return p.done()


def marco():
    p = Part('canasto_marco')
    t = 0.022
    for z in (Z0, Z1):
        p.box((0, Y1, z), (W + t, t, t))
        p.box((0, Y0, z), (W + t, t * 0.8, t * 0.8))
    for x in (X0, X1):
        p.box((x, Y1, 0), (t, t, D + t))
        p.box((x, Y0, 0), (t * 0.8, t * 0.8, D + t))
    for x in (X0, X1):
        for z in (Z0, Z1):
            p.box((x, 0, z), (t * 0.8, H, t * 0.8))
    # caño de 1,2 m con la placa abajo y la ménsula que sostiene el fondo
    p.tube(0, 0, -1.2, Y0, 0.03, 6)
    p.box((0, -1.2 + 0.005, 0), (0.16, 0.01, 0.16))
    p.box((0, Y0 - 0.02, 0), (W * 0.7, 0.025, 0.04))
    return p.done()


def bake(ob, base):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.render.film_transparent = False
    scene.world.light_settings.distance = 0.4
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for d in ca.data:
        k = 0.6 + 0.4 * d.color[0]
        d.color = (base[0] * k, base[1] * k, base[2] * k, 1)


os.makedirs(os.path.dirname(GLB), exist_ok=True)
mesh_texture()
parts = [malla(), marco()]
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -1.2))
floor = bpy.context.active_object
bake(parts[0], (1, 1, 1))
bake(parts[1], IRON)
bpy.data.objects.remove(floor)
for o in scene.objects:
    o.select_set(o in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB, TEX)
