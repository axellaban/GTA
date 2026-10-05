# Torres de las iglesias hechas en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/iglesia.py
# Sale public/models/landmarks/iglesia.glb con dos piezas que src/iglesia-kit.js pone en el frente de las
# iglesias (para que se reconozcan de lejos: el edificio sigue siendo el de siempre):
#   campanario  torre de ladrillo de 4,2 m de lado y 20 m de alto para la parroquia: portal con arco y
#               escalinata, esquineros de piedra, óculo, reloj, campanario con arcos en los cuatro lados,
#               cornisas, aguja de cobre y la cruz. Origen al pie, en el medio del frente; la mitad de atrás
#               queda adentro del edificio (de z = -2,1 a 2,1; +z hacia la calle).
#   espadana    espadaña para las capillas: muro de remate con dos huecos para las campanas, frontón y cruz,
#               que va arriba de la pared del frente (origen en el borde del techo, en el medio).
# Colores en los vértices con la sombra de contacto horneada (Cycles).
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'landmarks', 'iglesia.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return lin((((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255))


def B(x, y, z):
    return (x, -z, y)  # juego (y arriba) -> Blender (z arriba)


BRICK = 0xa8664c  # (el promedio del ladrillo con la junta de la fachada, src/textures.js)
STONE = 0xe7dcc3
DARK = 0x1d1a18
DOOR = 0x4a2f1f
COPPER = 0x4f8a76
GOLD = 0xc9a227


class Kit:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.cols = []

    def color(self, h):
        c = hexc(h)
        if c not in self.cols:
            self.cols.append(c)
        return self.cols.index(c)

    def _merge(self, tmp, col, smooth=False):
        ci = self.color(col)
        layer = tmp.faces.layers.int.get('ci') or tmp.faces.layers.int.new('ci')
        for f in tmp.faces:
            f[layer] = ci
            f.smooth = smooth
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def box(self, c, s, col):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(s[0], s[2], s[1]), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=B(*c), verts=tmp.verts)
        self._merge(tmp, col)

    def poly(self, pts, col):
        # polígono plano (lista de puntos del juego), la normal hacia donde lo arman los puntos
        tmp = bmesh.new()
        tmp.faces.new([tmp.verts.new(B(*p)) for p in pts])
        self._merge(tmp, col)

    def arch_panel(self, face, cx, y0, w, h, col, out=0.012, segs=8):
        # hueco con arco de medio punto, como cara oscura apenas delante de la pared; face: (eje, signo, plano)
        r = w / 2
        pts2 = [(cx - r, y0), (cx + r, y0), (cx + r, y0 + h - r)]
        pts2 += [(cx + r * math.cos(math.pi * i / segs), y0 + h - r + r * math.sin(math.pi * i / segs)) for i in range(1, segs)]
        pts2 += [(cx - r, y0 + h - r)]
        self.poly([face(u, v, out) for u, v in pts2], col)

    def ring_arch(self, face, cx, y0, w, h, col, t=0.18, out=0.03, segs=8):
        # moldura del arco (archivolta) alrededor del hueco
        r = w / 2
        for i in range(segs):
            a0 = math.pi * i / segs
            a1 = math.pi * (i + 1) / segs
            p = [(cx + r * math.cos(a0), y0 + h - r + r * math.sin(a0)), (cx + (r + t) * math.cos(a0), y0 + h - r + (r + t) * math.sin(a0)),
                 (cx + (r + t) * math.cos(a1), y0 + h - r + (r + t) * math.sin(a1)), (cx + r * math.cos(a1), y0 + h - r + r * math.sin(a1))]
            self.poly([face(u, v, out) for u, v in reversed(p)], col)

    def done(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=0.0001)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.cols for v in c]
        return ob


def faces_of(half):
    # las cuatro caras de una torre de lado 2*half: devuelve funciones (u, v, salida) -> punto del juego,
    # con u a lo ancho de la cara (de izquierda a derecha mirándola desde afuera) y la normal hacia afuera
    return [
        lambda u, v, o: (u, v, half + o),  # frente (+z)
        lambda u, v, o: (-u, v, -half - o),  # atrás
        lambda u, v, o: (half + o, v, -u),  # derecha (+x)
        lambda u, v, o: (-half - o, v, u),  # izquierda
    ]


def campanario():
    k = Kit('campanario')
    S = 2.1  # medio lado
    H1, H2, H3 = 6.6, 12.4, 15.6  # remates: cuerpo bajo, fuste, campanario
    # cuerpo de ladrillo y esquineros de piedra
    k.box((0, H3 / 2, 0), (2 * S, H3, 2 * S), BRICK)
    for sx in (-1, 1):
        for sz in (-1, 1):
            for y in range(0, int(H3 / 0.6)):
                w = 0.5 if y % 2 else 0.36
                k.box((sx * (S - w / 2 + 0.02), y * 0.6 + 0.3, sz * (S + 0.02)), (w, 0.56, 0.06), STONE)
                k.box((sx * (S + 0.02), y * 0.6 + 0.3, sz * (S - (0.86 - w) / 2 + 0.02)), (0.06, 0.56, 0.86 - w), STONE)
    # cornisas (fajas de piedra que sobresalen) al terminar cada cuerpo
    for y, t in ((H1, 0.22), (H2, 0.26), (H3, 0.34)):
        k.box((0, y, 0), (2 * S + 2 * t, 0.24, 2 * S + 2 * t), STONE)
        k.box((0, y - 0.18, 0), (2 * S + t, 0.12, 2 * S + t), STONE)
    k.box((0, 0.2, 0), (2 * S + 0.3, 0.4, 2 * S + 0.3), STONE)  # zócalo
    F = faces_of(S)
    front = F[0]
    # portal: puerta con arco, archivolta, y escalinata
    k.arch_panel(front, 0, 0.4, 1.9, 3.9, DOOR)
    k.ring_arch(front, 0, 0.4, 1.9, 3.9, STONE, t=0.28)
    for i, (d, h) in enumerate(((1.0, 0.15), (0.7, 0.3), (0.4, 0.45))):
        k.box((0, h / 2, S + d / 2), (3.2 - i * 0.3, h, d), STONE)
    # óculo arriba del portal y reloj en el fuste
    def disc(face, cx, cy, r, col, out, n=16):
        k.poly([face(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), out) for i in range(n)], col)
    disc(front, 0, 5.4, 0.7, STONE, 0.02)
    disc(front, 0, 5.4, 0.55, DARK, 0.03)
    for face in F:
        disc(face, 0, 10.6, 0.95, STONE, 0.02)
        disc(face, 0, 10.6, 0.82, 0xf4f1e8, 0.03)
        # agujas del reloj (las diez y diez)
        for ang, L, w in ((math.radians(60), 0.55, 0.06), (math.radians(150), 0.7, 0.045)):
            c, s = math.cos(ang), math.sin(ang)
            pts = [(-s * w, c * w), (s * w, -c * w), (s * w + c * L, -c * w + s * L), (-s * w + c * L, c * w + s * L)]
            k.poly([face(u, 10.6 + v, 0.04) for u, v in pts], DARK)
        # ventana alta del fuste y huecos del campanario (dos arcos por cara)
        k.arch_panel(face, 0, 7.4, 0.7, 1.9, DARK)
        k.ring_arch(face, 0, 7.4, 0.7, 1.9, STONE, t=0.14)
        for cx in (-0.85, 0.85):
            k.arch_panel(face, cx, H2 + 0.4, 1.1, 2.5, DARK)
            k.ring_arch(face, cx, H2 + 0.4, 1.1, 2.5, STONE, t=0.16)
    # aguja de cobre (pirámide de ocho caras) y la cruz
    tmp = bmesh.new()
    base = H3 + 0.12
    top = H3 + 5.4
    n = 8
    r = S * 0.98
    ring = [tmp.verts.new(B(r * math.cos(2 * math.pi * (i + 0.5) / n), base, r * math.sin(2 * math.pi * (i + 0.5) / n))) for i in range(n)]
    apex = tmp.verts.new(B(0, top, 0))
    for i in range(n):
        tmp.faces.new((ring[i], ring[(i + 1) % n], apex))
    tmp.faces.new(list(reversed(ring)))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    k._merge(tmp, COPPER)
    k.box((0, top + 0.1, 0), (0.18, 0.3, 0.18), GOLD)
    k.box((0, top + 1.0, 0), (0.12, 1.6, 0.12), GOLD)
    k.box((0, top + 1.3, 0), (0.8, 0.12, 0.12), GOLD)
    return k.done()


def espadana():
    k = Kit('espadana')
    W, H, T = 3.2, 3.4, 0.4
    # muro con remate en frontón (de y = 0, el borde del techo, para arriba)
    tmp = bmesh.new()
    prof = [(-W / 2, 0), (W / 2, 0), (W / 2, H - 0.9), (0, H), (-W / 2, H - 0.9)]
    front = [tmp.verts.new(B(x, y, 0.02)) for x, y in prof]
    back = [tmp.verts.new(B(x, y, -T)) for x, y in prof]
    tmp.faces.new(front)
    tmp.faces.new(list(reversed(back)))
    for i in range(len(prof)):
        j = (i + 1) % len(prof)
        tmp.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    k._merge(tmp, STONE)
    face = lambda u, v, o: (u, v, 0.02 + o)  # noqa: E731
    back_face = lambda u, v, o: (-u, v, -T - o)  # noqa: E731
    for f in (face, back_face):
        for cx in (-0.7, 0.7):
            k.arch_panel(f, cx, 0.6, 0.8, 1.7, DARK)
            k.ring_arch(f, cx, 0.6, 0.8, 1.7, 0xd4c8ad, t=0.12)
    # cornisa del frontón y la cruz
    k.box((0, H - 0.9, -T / 2 + 0.01), (W + 0.3, 0.16, T + 0.12), 0xd4c8ad)
    k.box((0, H + 0.6, -T / 2), (0.1, 1.2, 0.1), GOLD)
    k.box((0, H + 0.85, -T / 2), (0.6, 0.1, 0.1), GOLD)
    return k.done()


def bake(ob, floor_y):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 1.2
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, floor_y))
    floor = bpy.context.active_object
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = [0.55 + 0.45 * d.color[0] for d in ca.data]
    me.color_attributes.remove(ca)
    bpy.data.objects.remove(floor)
    pal = list(ob['palette'])
    pal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    ci = me.attributes['ci']
    col = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = pal[ci.data[poly.index].value]
        for li in poly.loop_indices:
            col.data[li].color = (c[0] * ao[li], c[1] * ao[li], c[2] * ao[li], 1)
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['ci'])


os.makedirs(os.path.dirname(GLB), exist_ok=True)
parts = [campanario(), espadana()]
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    bake(ob, 0.0 if ob.name == 'campanario' else -4.0)
for o in parts:
    o.hide_render = False
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB)
