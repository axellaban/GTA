# Farol de la calle hecho en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/farol.py
# Sale public/models/street/farol.glb con tres mallas, en los mismos marcos que arma addLamps
# (src/city.js) y que voltea src/smash.js:
#   poste   palo de madera de 8,5 m que se afina, collar de hormigón abajo y cruceta para los cables
#           (origen a media altura, como el cilindro de antes)
#   brazo   abrazadera, brazo curvo, tirante y la carcasa de aluminio tipo "cobra" (origen en la base
#           del poste; el brazo sale hacia +z del juego)
#   vidrio  la tapa de vidrio del cabezal, la que se prende de noche (origen en el centro del cabezal)
# Los colores van en los colores de vértice (madera, hormigón, aluminio) y el material del juego queda
# blanco. ~220 triángulos por farol: hay ~800 en el mapa.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'street', 'farol.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    # color sRGB (como se elige a ojo) a lineal (lo que guarda el glTF)
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


class Part:
    # arma una malla en coordenadas del juego (y arriba, z adelante) con un color por cara
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.cols = []

    def v(self, x, y, z):
        return self.bm.verts.new((x, -z, y))  # juego -> Blender (z arriba)

    def face(self, vs, col):
        f = self.bm.faces.new(vs)
        self.cols.append((f, lin(col)))
        return f

    def tube(self, pts, r, sides, col, caps=False):
        # anillos perpendiculares a cada tramo (el tramo va más o menos en un plano vertical)
        rings = []
        for i, p in enumerate(pts):
            a = pts[max(0, i - 1)]
            b = pts[min(len(pts) - 1, i + 1)]
            d = [b[k] - a[k] for k in range(3)]
            L = math.sqrt(sum(c * c for c in d)) or 1
            d = [c / L for c in d]
            # dos ejes perpendiculares a d
            ref = (1, 0, 0) if abs(d[0]) < 0.9 else (0, 1, 0)
            u = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]
            lu = math.sqrt(sum(c * c for c in u))
            u = [c / lu for c in u]
            w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
            rr = r(i / (len(pts) - 1)) if callable(r) else r
            rings.append([self.v(*[p[k] + rr * (math.cos(t) * u[k] + math.sin(t) * w[k]) for k in range(3)]) for t in (2 * math.pi * j / sides for j in range(sides))])
        for a, b in zip(rings, rings[1:]):
            for j in range(sides):
                k = (j + 1) % sides
                self.face((a[j], a[k], b[k], b[j]), col(rings.index(a) / (len(rings) - 1)) if callable(col) else col)
        if caps:
            self.face(list(reversed(rings[0])), col(0) if callable(col) else col)
            self.face(rings[-1], col(1) if callable(col) else col)

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        ca = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
        for poly, (_, c) in zip(me.polygons, self.cols):
            for li in poly.loop_indices:
                ca.data[li].color = (*c, 1)
        me.color_attributes.active_color = ca
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        return ob


WOOD = (0.42, 0.33, 0.25)
WOOD_LOW = (0.27, 0.21, 0.16)
CONCRETE = (0.62, 0.61, 0.58)
METAL = (0.3, 0.32, 0.34)
ALU = (0.78, 0.8, 0.82)
ALU_LOW = (0.52, 0.54, 0.57)

# ---- poste (origen a media altura: va de y -4,25 a 4,25) ----
p = Part('poste')
H2 = 4.25
p.tube([(0, -H2, 0), (0, -H2 + 1.5, 0), (0, 0, 0), (0, H2, 0)], lambda t: 0.15 - 0.04 * t, 6,
       lambda t: tuple(WOOD_LOW[k] + (WOOD[k] - WOOD_LOW[k]) * min(1, t * 3) for k in range(3)), caps=True)
p.tube([(0, -H2, 0), (0, -H2 + 0.45, 0)], 0.22, 6, CONCRETE, caps=True)  # collar de hormigón
p.tube([(-0.65, 3.75, 0), (0.65, 3.75, 0)], 0.05, 4, WOOD, caps=True)  # cruceta para los cables
poste = p.done()

# ---- brazo y carcasa (origen en la base del poste; sale hacia +z) ----
b = Part('brazo')
b.tube([(0, 7.0, 0), (0, 7.16, 0)], 0.155, 6, METAL, caps=True)  # abrazadera
# sube pegado al poste y termina derecho hacia afuera
arc = [(0, 7.08 + math.sin(a) * 0.62, 0.13 + (1 - math.cos(a)) * 1.25) for a in (j / 5 * math.pi / 2 for j in range(6))]
b.tube(arc, 0.035, 5, METAL)
b.tube([(0, 7.98, 0.12), (0, 7.69, 1.0)], 0.016, 4, METAL)  # tirante del poste a la punta del brazo
# carcasa "cobra": secciones redondeadas a lo largo de z, más alta atrás, se afina adelante
secs = []
for i, (z, w, h) in enumerate([(1.12, 0.07, 0.07), (1.24, 0.15, 0.12), (1.45, 0.17, 0.15), (1.68, 0.15, 0.12), (1.86, 0.08, 0.06)]):
    y0 = 7.7 + (z - 1.12) * 0.06
    ring = []
    for j in range(8):
        t = 2 * math.pi * j / 8
        cy = math.sin(t)
        ring.append(b.v(w * math.cos(t), y0 + (h * cy if cy > 0 else 0.35 * h * cy), z))
    secs.append(ring)
for i, (s0, s1) in enumerate(zip(secs, secs[1:])):
    for j in range(8):
        k = (j + 1) % 8
        under = math.sin(2 * math.pi * (j + 0.5) / 8) < 0
        b.face((s0[j], s0[k], s1[k], s1[j]), ALU_LOW if under else ALU)
b.face(list(reversed(secs[0])), ALU)
b.face(secs[-1], ALU)
brazo = b.done()

# ---- vidrio (origen en el centro del cabezal, a 1,45 m del poste y 7,72 de alto) ----
g = Part('vidrio')
rim, bottom = [], []
for j in range(10):
    t = 2 * math.pi * j / 10
    rim.append(g.v(0.13 * math.cos(t), -0.01, 0.05 + 0.27 * math.sin(t)))
    bottom.append(g.v(0.09 * math.cos(t), -0.06, 0.05 + 0.19 * math.sin(t)))
for j in range(10):
    k = (j + 1) % 10
    g.face((rim[j], rim[k], bottom[k], bottom[j]), (1, 1, 1))
g.face(list(reversed(bottom)), (1, 1, 1))
vidrio = g.done()

os.makedirs(os.path.dirname(GLB), exist_ok=True)
for ob in scene.objects:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
total = 0
for ob in (poste, brazo, vidrio):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    total += tris
    print(f'{ob.name}: {tris} triángulos')
print(f'total {total}; listo:', GLB)
