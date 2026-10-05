# Autos de alta gama hechos en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/autos.py            sale public/models/vehicles/lujo.glb (con npx a mano, la achica
#                                             con glTF-Transform: normales y colores en enteros)
#   python3 tools/blender/autos.py --vista    además, una foto de cada auto (para revisar las formas)
# Parodias sin marcas, como los autos de los GTA. Cada carrocería sale de cortes transversales a lo largo
# del auto (alto del zócalo, de la línea de cintura y del techo, anchos), unidos y suavizados: así tiene los
# costados redondeados, el parabrisas inclinado y el techo con comba, no cajas. Los pasarruedas se cortan con
# cilindros (Boolean). Los vidrios son las caras del habitáculo, con el interior (tapizado, butacas, tablero,
# volante) atrás. La sombra de contacto se hornea en Cycles en el color de los vértices.
# Mismo formato que los autos de Quaternius (src/cars.js): un nodo por auto con las mallas paint (la chapa:
# el juego le pone el color; los vértices traen la sombra y lo que va negro), glass, detail, lights, tail,
# shiny (cromados) y wheel (una rueda, con la llanta para +x); en extras, dónde van las ruedas y la medida.
import math
import os
import sys

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'vehicles', 'lujo.glb')
VISTA = '--vista' in sys.argv
OUT_VISTA = os.environ.get('AUTOS_VISTA', os.path.join(ROOT, 'autos-vista'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return lin((((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255))


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------- interpolación sin pasarse (PCHIP)


def pchip(xs, ys, x):
    n = len(xs)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    k = max(i for i in range(n - 1) if xs[i] <= x)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]

    def slope(i):
        if i == 0:
            return d[0]
        if i == n - 1:
            return d[-1]
        if d[i - 1] * d[i] <= 0:
            return 0.0
        w1 = 2 * h[i] + h[i - 1]
        w2 = h[i] + 2 * h[i - 1]
        return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    t = (x - xs[k]) / h[k]
    m0, m1 = slope(k) * h[k], slope(k + 1) * h[k]
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * m1


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3) for a, b, c, d in zip(p0, p1, p2, p3))


# ---------------------------------------------------------------- el corte transversal
# Medio corte (del centro de abajo al centro del techo), 9 puntos clave: zócalo, costado, cintura,
# costado del habitáculo, borde del techo y comba. Entre clave y clave se agregan puntos (SEG).
SEG = [2, 1, 2, 3, 2, 2, 1, 3]
KEY = [sum(SEG[:k]) for k in range(len(SEG) + 1)]  # dónde queda cada clave
NH = KEY[-1]
BELT, ROOF = KEY[4], KEY[6]


def half_profile(p):
    zb, zs, zt = p['zb'], p['zs'], p['zt']
    wb, wm, ws, wt = p['wb'], p['wm'], p['ws'], p['wt']
    cr = p['cr']
    zm = zb + (zs - zb) * p.get('zmf', 0.5)
    k = [(0.0, zb), (wb * 0.8, zb), (wb, zb + min(0.07, (zm - zb) * 0.45)), (wm, zm), (ws, zs),
         (lerp(ws, wt, p.get('gs', 0.42)), lerp(zs, zt, 0.5)), (wt, zt), (wt - 0.075, zt + cr * 0.32), (0.0, zt + cr)]
    out = [k[0]]
    for i in range(len(k) - 1):
        a, b = k[max(0, i - 1)], k[i]
        c, d = k[i + 1], k[min(len(k) - 1, i + 2)]
        for j in range(1, SEG[i]):
            out.append(catmull(a, b, c, d, j / SEG[i]))
        out.append(c)
    return out


PARAMS = ('zb', 'zs', 'zt', 'wb', 'wm', 'ws', 'wt', 'cr', 'zmf', 'gs')


def stations(keys, dy=0.11):
    # cortes intermedios (interpolados sin pasarse) y dónde quedó cada corte clave
    ys = [k['y'] for k in keys]
    out, kidx = [], []
    for i in range(len(keys) - 1):
        kidx.append(len(out))
        n = max(1, round((ys[i + 1] - ys[i]) / dy))
        for j in range(n):
            y = lerp(ys[i], ys[i + 1], j / n)
            out.append({'y': y, **{q: pchip(ys, [k.get(q, keys[0].get(q, 0.5 if q == 'zmf' else 0.42)) for k in keys], y) for q in PARAMS}})
    kidx.append(len(out))
    out.append(dict(keys[-1]))
    return out, kidx


# ---------------------------------------------------------------- piezas sueltas
# cada malla se arma en un bmesh con un entero por cara ('ci': índice en la paleta de esa malla)


class Part:
    def __init__(self, name, palette):
        self.name = name
        self.bm = bmesh.new()
        self.ci = self.bm.faces.layers.int.new('ci')
        self.pal = list(palette)

    def color(self, c):
        if c not in self.pal:
            self.pal.append(c)
        return self.pal.index(c)

    def face(self, verts, c):
        f = self.bm.faces.new([self.bm.verts.new(v) for v in verts])
        f[self.ci] = self.color(c)
        return f

    def box(self, c, s, col, rot=None):
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        m = rot or Matrix.Identity(3)
        v = [self.bm.verts.new(Vector(c) + m @ Vector((i * hx, j * hy, k * hz))) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
        idx = self.color(col)
        new = []
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            face = self.bm.faces.new([v[i] for i in f])
            face[self.ci] = idx
            new.append(face)
        bmesh.ops.recalc_face_normals(self.bm, faces=new)

    def cyl(self, c, r, h, col, axis='Z', n=12, r2=None, caps=True):
        rot = {'Z': Matrix.Identity(4), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h, matrix=Matrix.Translation(c) @ rot)
        idx = self.color(col)
        new = list({f for v in res['verts'] for f in v.link_faces})
        for f in new:
            f[self.ci] = idx
        bmesh.ops.recalc_face_normals(self.bm, faces=new)

    def sph(self, c, r, col, sc=(1, 1, 1), u=10, v=7):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*sc, 1)))
        idx = self.color(col)
        for f in {f for vv in res['verts'] for f in vv.link_faces}:
            f[self.ci] = idx

    def strip(self, pts, nrm, w, h, col, up=Vector((0, 0, 1))):
        # tira que sigue la superficie (pts, con su normal nrm): w de ancho (sobre la superficie, a lo `up`)
        # y h de alto (hacia afuera); para molduras, aletas, burletes y rayas
        idx = self.color(col)
        rows = []
        for p, n in zip(pts, nrm):
            u = (up - n * up.dot(n)).normalized() * (w / 2)
            rows.append([self.bm.verts.new(p - u), self.bm.verts.new(p + u), self.bm.verts.new(p + u + n * h), self.bm.verts.new(p - u + n * h)])
        new = []
        for a, b in zip(rows, rows[1:]):
            for i in range(4):
                f = self.bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
                f[self.ci] = idx
                new.append(f)
        for r in (rows[0], rows[-1][::-1]):
            f = self.bm.faces.new(r[::-1])
            f[self.ci] = idx
            new.append(f)
        bmesh.ops.recalc_face_normals(self.bm, faces=new)

    def patch(self, grid, col):
        # grilla de puntos (filas x columnas) -> caras
        idx = self.color(col)
        vv = [[self.bm.verts.new(p) for p in row] for row in grid]
        for a, b in zip(vv, vv[1:]):
            for i in range(len(a) - 1):
                f = self.bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
                f[self.ci] = idx

    def obj(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.pal for v in hexc(c)]
        return ob


# ---------------------------------------------------------------- la carrocería


class Body:
    """La chapa: cortes clave -> malla, caras clasificadas (chapa, vidrio, negro), pasarruedas."""

    def __init__(self, spec):
        self.spec = spec
        st, kidx = stations(spec['keys'], spec.get('dy', 0.11))
        self.st, self.kidx = st, kidx
        self.k = {name: kidx[i] for i, name in enumerate(spec['names'])}
        bm = bmesh.new()
        rows = []
        for s in st:
            hp = half_profile(s)
            loop = hp + [(-x, z) for x, z in reversed(hp[1:-1])]
            rows.append([bm.verts.new((x, s['y'], z)) for x, z in loop])
        self.n = n = len(rows[0])
        self.faces = {}
        for s in range(len(rows) - 1):
            for i in range(n):
                f = bm.faces.new((rows[s][i], rows[s][(i + 1) % n], rows[s + 1][(i + 1) % n], rows[s + 1][i]))
                self.faces[(s, i)] = f
        bm.faces.new(rows[0])
        bm.faces.new(rows[-1][::-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.normal_update()
        self.bm = bm
        self.rows = rows

    def hseg(self, i):
        return i if i < NH else 2 * NH - 1 - i

    def classify(self, rule):
        # rule(s, h, cara) -> 'paint' | 'glass' | 'trim' | 'open'
        out = {}
        for (s, i), f in self.faces.items():
            out[f] = rule(s, self.hseg(i), f)
        return out


MATS = {}


def mat(name, col=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, alpha=1.0):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if alpha < 1:
            b.inputs['Alpha'].default_value = alpha
        MATS[name] = m
    return MATS[name]


def body_object(name, body, cls, wheels, wheel_r, arch_extra=0.06):
    """Chapa (sin los vidrios) con los pasarruedas cortados, y los vidrios aparte."""
    bm = body.bm
    slot = {'paint': 0, 'glass': 1, 'trim': 2, 'open': 3}
    for f, c in cls.items():
        f.material_index = slot[c]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    for m in ('paint', 'glass', 'trim', 'open'):
        me.materials.append(mat(m))
    # pasarruedas: cilindros a lo ancho, un poco más grandes que la rueda
    for (x, y, z) in wheels:
        bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=wheel_r + arch_extra, depth=0.9, location=(x * 1.25, y, z + 0.03), rotation=(0, math.pi / 2, 0))
        cut = bpy.context.active_object
        cut.data.materials.append(mat('liner'))
        mod = ob.modifiers.new('arco', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cut
        try:
            mod.material_mode = 'TRANSFER'
        except Exception:
            pass
        bpy.context.view_layer.objects.active = ob
        nf = len(ob.data.polygons)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if os.environ.get('AUTOS_DEBUG'):
            print('  arco', (round(x, 2), round(y, 2)), nf, '->', len(ob.data.polygons), flush=True)
        bpy.data.objects.remove(cut)
    # vidrios afuera
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    names = [m.name for m in ob.data.materials]
    gl = bmesh.new()
    vmap = {}
    for f in [f for f in bm.faces if names[f.material_index] == 'glass']:
        vs = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = gl.verts.new(v.co - f.normal * 0.012)
            vs.append(vmap[v])
        gl.faces.new(vs)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if names[f.material_index] in ('glass', 'open')], context='FACES_ONLY')
    bm.to_mesh(ob.data)
    bm.free()
    gme = bpy.data.meshes.new(name + '_glass')
    gl.to_mesh(gme)
    gl.free()
    gob = bpy.data.objects.new('glass', gme)
    scene.collection.objects.link(gob)
    return ob, gob


def bvh_of(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def hit(bvh, origin, direction):
    loc, nrm, idx, dist = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    return (loc, nrm) if loc is not None else (None, None)


# ---------------------------------------------------------------- ruedas


def wheel(spec):
    R = spec['wheelR']
    rr = R * spec.get('rim', 0.66)
    tw = spec.get('tireW', 0.24)
    P = Part('wheel', [0x151515])
    bm = P.bm

    def lathe(prof, col, segs=22):
        # perfil (x a lo ancho, r radio) que gira alrededor del eje x
        idx = P.color(col)
        rings = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rings.append([bm.verts.new((x, r * math.cos(a), r * math.sin(a))) for x, r in prof])
        for k in range(segs):
            A, B = rings[k], rings[(k + 1) % segs]
            for i in range(len(prof) - 1):
                f = bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
                f[P.ci] = idx

    h = tw / 2
    # cubierta: flanco, banda y el otro flanco
    lathe([(h - 0.01, rr + 0.005), (h + 0.004, R - 0.05), (h - 0.03, R - 0.004), (-h + 0.03, R - 0.004), (-h - 0.004, R - 0.05), (-h + 0.01, rr + 0.005)], 0x161616)
    # llanta: pestaña, el aro por dentro y el fondo oscuro
    lip = spec.get('rimCol', 0xc8c8c8)
    lathe([(-h + 0.01, rr + 0.005), (-h + 0.02, rr - 0.01), (h - 0.02, rr - 0.01), (h - 0.008, rr + 0.004), (h - 0.003, rr - 0.012), (h - 0.03, rr - 0.03)], lip)
    lathe([(h - 0.07, rr - 0.03), (-h + 0.04, rr - 0.03), (-h + 0.04, 0.06), (h - 0.07, 0.06)], 0x3a3a3a)
    # rayos (estrella de 5, 10 o malla), con la maza y la tuerca central
    style = spec.get('spokes', 5)
    face = h - 0.03
    if style == 'malla':
        for k in range(10):
            a = 2 * math.pi * k / 10
            for s in (-1, 1):
                m = Matrix.Rotation(a, 3, 'X') @ Matrix.Rotation(s * 0.42, 3, 'X')
                P.box(Vector((face - 0.02, 0, 0)) + m @ Vector((0, 0, (rr - 0.06) / 2 + 0.05)), (0.03, 0.022, rr - 0.08), lip, Matrix.Rotation(a + s * 0.25, 3, 'X'))
    else:
        n = style
        for k in range(n):
            a = 2 * math.pi * k / n
            m = Matrix.Rotation(a, 3, 'X')
            ln = rr - 0.07
            w = spec.get('spokeW', 0.05)
            P.box(m @ Vector((face - 0.025, 0, 0.065 + ln / 2)), (0.035, w * (0.75 if n > 6 else 1), ln), lip, m)
            if n <= 6:
                # el rayo se abre en Y cerca del aro
                for s in (-1, 1):
                    mm = Matrix.Rotation(a + s * 0.13, 3, 'X')
                    P.box(mm @ Vector((face - 0.025, 0, rr - 0.075)), (0.03, w * 0.6, 0.07), lip, mm)
    P.cyl((face - 0.02, 0, 0), 0.075, 0.05, lip, axis='X', n=16)
    P.cyl((face + 0.01, 0, 0), 0.035, 0.03, spec.get('nutCol', 0xd8d8d8), axis='X', n=6 if spec.get('centerlock') else 12)
    # disco de freno y mordaza (se ven entre los rayos)
    P.cyl((-0.02, 0, 0), rr - 0.05, 0.025, 0x6d6d6d, axis='X', n=16)
    P.box((0.0, 0, rr - 0.11), (0.06, 0.16, 0.07), spec.get('caliper', 0x8a8a8a))
    return P


# ---------------------------------------------------------------- un auto


def build_car(spec):
    body = Body(spec)
    k = body.k
    W_ = spec['W'] / 2
    # vidrios y negros según el corte (s) y el punto del medio corte (h)
    pillars = spec.get('pillars', [])

    def rule(s, h, f):
        top = h >= ROOF
        side = BELT <= h < ROOF
        if spec.get('open') and (top or side) and k['ws1'] <= s < k['rr']:
            return 'open' if top or h > BELT else 'trim'
        if top and k['ws0'] <= s < k['ws1']:
            # el parante A: del color del auto o negro (abajo, donde el parabrisas arranca casi acostado, chapa)
            if h == ROOF:
                return 'paint' if spec.get('aPaint', True) or s < (k['ws0'] + k['ws1']) / 2 else 'trim'
            return 'glass'
        if top and k['rr'] <= s < k['rw1'] and spec.get('rearGlass', True):
            return 'trim' if h == ROOF else 'glass'
        if side and k['ws0'] <= s < k['ws1']:
            # al lado del parabrisas: arriba y parado, negro (el triángulo del espejo); lo demás, chapa
            return 'trim' if abs(f.normal.z) < 0.55 and s >= (k['ws0'] + k['ws1']) / 2 else 'paint'
        if side and k['ws1'] <= s < k['rr']:
            if h == BELT:
                return 'trim'
            ym = (body.st[s]['y'] + body.st[s + 1]['y']) / 2
            if any(abs(ym - y) < 0.07 for y in pillars):
                return 'trim'
            if s >= k['rr'] - spec.get('cpillar', 1):
                return 'paint' if spec.get('cPaint', True) else 'trim'
            return 'glass'
        if side and k['rr'] <= s < k['rw1']:
            return 'paint' if spec.get('cPaint', True) else 'trim'
        if top and k['ws1'] <= s < k['rr'] and spec.get('roofBlack'):
            return 'trim'
        if spec.get('blackSill') and h <= 1:
            return 'trim'
        return 'paint'

    cls = body.classify(rule)
    wheels = spec['wheels']
    # interior: copia del habitáculo para adentro (tapizado, piso y cielorraso) antes de cortar los arcos
    inner = Part('inner', [0x1a1a1a])
    ys0, ys1 = k['ws0'] - 2, k['rw1'] + 1
    vmap = {}
    wy = [w[1] for w in spec['wheels']]
    for (s, i), f in body.faces.items():
        if not ys0 <= s < ys1 or cls[f] == 'open':
            continue
        ym = (body.st[s]['y'] + body.st[s + 1]['y']) / 2
        if body.hseg(i) < BELT and any(abs(ym - y) < spec['wheelR'] + 0.16 for y in wy):
            continue
        vs = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = inner.bm.verts.new(v.co - v.normal * 0.035)
            vs.append(vmap[v])
        nf = inner.bm.faces.new(vs[::-1])
        nf[inner.ci] = inner.color(spec.get('cabin', 0x2a2a2a) if body.hseg(i) >= BELT else spec.get('floor', 0x1c1c1c))
    for s in (ys0, ys1):
        ring = [vmap[v].co.copy() for v in body.rows[s] if v in vmap]
        if len(ring) > 2:
            # (de las dos caras: el mamparo se ve desde el habitáculo)
            inner.face(ring, 0x1c1c1c)
            inner.face(ring[::-1], 0x1c1c1c)
    paint, glass = body_object('paint', body, cls, wheels, spec['wheelR'], spec.get('arch', 0.06))
    bvh = bvh_of(paint)
    D = Part('detail', [0x111111])
    S = Part('shiny', [0xdddddd])
    Lh = Part('lights', [0xfff3cf])
    T = Part('tail', [0xb01010])
    X = Part('extra', [0xffffff])  # piezas de chapa (se juntan con la carrocería)

    def side_pts(y0, y1, z, sx, step=0.1):
        pts, nrm = [], []
        n = max(2, int(abs(y1 - y0) / step) + 1)
        for j in range(n):
            y = lerp(y0, y1, j / (n - 1))
            loc, nr = hit(bvh, (sx * (W_ + 1), y, z), (-sx, 0, 0))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        return pts, nrm

    def end_pts(x0, x1, z, front, step=0.08):
        pts, nrm = [], []
        n = max(2, int(abs(x1 - x0) / step) + 1)
        L2 = spec['L'] / 2 + 1
        for j in range(n):
            x = lerp(x0, x1, j / (n - 1))
            loc, nr = hit(bvh, (x, -L2 if front else L2, z), (0, 1 if front else -1, 0))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        return pts, nrm

    def top_pts(x, y0, y1, step=0.08):
        pts, nrm = [], []
        n = max(2, int(abs(y1 - y0) / step) + 1)
        for j in range(n):
            y = lerp(y0, y1, j / (n - 1))
            loc, nr = hit(bvh, (x, y, 3), (0, 0, -1))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        return pts, nrm

    def end_patch(part, x0, x1, z0, z1, front, col, off=0.004, nx=6, nz=3):
        # rectángulo pegado a la trompa o la cola (faros, parrilla, patente)
        x0, x1 = min(x0, x1), max(x0, x1)
        L2 = spec['L'] / 2 + 1
        grid = []
        for a in range(nz + 1):
            row = []
            for b in range(nx + 1):
                x, z = lerp(x0, x1, b / nx), lerp(z0, z1, a / nz)
                loc, nr = hit(bvh, (x, -L2 if front else L2, z), (0, 1 if front else -1, 0))
                if loc is None:
                    return
                row.append(loc + nr * off)
            grid.append(row if front else row[::-1])
        part.patch(grid, col)

    def top_patch(part, x0, x1, y0, y1, col, off=0.004, nx=4, ny=4):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        grid = []
        for a in range(ny + 1):
            row = []
            for b in range(nx + 1):
                x, y = lerp(x0, x1, b / nx), lerp(y0, y1, a / ny)
                loc, nr = hit(bvh, (x, y, 3), (0, 0, -1))
                if loc is None:
                    return
                row.append(loc + nr * off)
            grid.append(row)
        part.patch(grid, col)

    def side_patch(part, y0, y1, z0, z1, sx, col, off=0.004, ny=6, nz=3):
        y0, y1 = min(y0, y1), max(y0, y1)
        grid = []
        for a in range(nz + 1):
            row = []
            for b in range(ny + 1):
                y, z = lerp(y0, y1, b / ny), lerp(z0, z1, a / nz)
                loc, nr = hit(bvh, (sx * (W_ + 1), y, z), (-sx, 0, 0))
                if loc is None:
                    return
                row.append(loc + nr * off)
            grid.append(row if sx > 0 else row[::-1])
        part.patch(grid, col)

    ctx = dict(spec=spec, body=body, bvh=bvh, D=D, S=S, L=Lh, T=T, X=X, side_pts=side_pts, end_pts=end_pts, top_pts=top_pts,
               end_patch=end_patch, top_patch=top_patch, side_patch=side_patch, W2=W_)
    # lo de todos: espejos, manijas, burletes, patentes, limpiaparabrisas, butacas, tablero y volante
    common_details(ctx)
    spec['details'](ctx)
    # la chapa extra y el interior van en la misma malla que la carrocería
    extra = X.obj()
    inn = inner.obj()
    parts = {'paint': paint, 'glass': glass}
    for name, P in (('detail', D), ('shiny', S), ('lights', Lh), ('tail', T)):
        ob = P.obj()
        ob.name = name
        parts[name] = ob
    # paleta de la chapa: blanco (lleva el color del auto), negro brillante, gomas de los arcos e interior
    paint['palette'] = [v for c in (0xffffff, 0x0e0e0e, 0x0e0e0e, 0x0a0a0a) for v in hexc(c)]
    me = paint.data
    names = [m.name for m in me.materials]
    ci = me.attributes.new('ci', 'INT', 'FACE')
    for p in me.polygons:
        nm = names[p.material_index] if p.material_index < len(names) else 'paint'
        ci.data[p.index].value = {'paint': 0, 'trim': 1, 'liner': 2}.get(nm, 0)
    me.materials.clear()
    join_into(paint, extra, {0: 0}, X.pal)
    join_into(paint, inn, None, inner.pal)
    wh = wheel(spec).obj()
    wh.name = 'wheel'
    parts['wheel'] = wh
    return parts


def join_into(dst, src, remap, pal):
    # agrega la malla src a dst; los índices de color de src pasan a la paleta de dst
    dpal = list(dst['palette'])
    dpal = [tuple(dpal[i:i + 3]) for i in range(0, len(dpal), 3)]
    spal = [hexc(c) for c in pal]
    bm = bmesh.new()
    bm.from_mesh(dst.data)
    n0 = len(bm.faces)
    ci = bm.faces.layers.int.get('ci')
    sbm = bmesh.new()
    sbm.from_mesh(src.data)
    sci = sbm.faces.layers.int.get('ci')
    vmap = {}
    for f in sbm.faces:
        vs = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = bm.verts.new(v.co)
            vs.append(vmap[v])
        nf = bm.faces.new(vs)
        c = spal[f[sci]]
        if c not in dpal:
            dpal.append(c)
        nf[ci] = dpal.index(c)
    sbm.free()
    bm.to_mesh(dst.data)
    bm.free()
    dst['palette'] = [v for c in dpal for v in c]
    bpy.data.objects.remove(src)
    return n0


def common_details(c):
    sp, D, S, X = c['spec'], c['D'], c['S'], c['X']
    k = c['body'].k
    st = c['body'].st
    y_ws0 = st[k['ws0']]['y']
    y_ws1 = st[k['ws1']]['y']
    belt = st[k['ws0']]['zs']
    W2 = c['W2']
    # espejos: brazo y carcasa (de chapa) con el espejo negro
    for sx in (-1, 1):
        loc, nr = hit(c['bvh'], (sx * (W2 + 1), y_ws0 + 0.18, belt + 0.06), (-sx, 0, 0))
        if loc is None:
            continue
        base = loc + Vector((sx * 0.01, 0, 0))
        X.box(base + Vector((sx * 0.06, 0.01, 0.025)), (0.1, 0.035, 0.025), 0xffffff, Matrix.Rotation(sx * -0.35, 3, 'Y'))
        X.sph(base + Vector((sx * 0.14, 0.02, 0.06)), 0.06, 0xffffff, sc=(1.25, 0.75, 0.85))
        D.box(base + Vector((sx * 0.14, 0.066, 0.06)), (0.12, 0.004, 0.08), 0x202830)
    # manijas: una en cada puerta (negras o cromadas)
    for hy in sp.get('handles', [lerp(y_ws0, st[k['rr']]['y'], 0.62)]):
        for sx in (-1, 1):
            c['side_patch'](S if sp.get('chromeHandles') else D, hy - 0.08, hy + 0.08, belt - 0.11, belt - 0.07, sx, 0xdddddd if sp.get('chromeHandles') else 0x101010, off=0.004, ny=3, nz=1)
    # limpiaparabrisas
    for x in (-0.35, 0.15):
        pts, nrm = c['top_pts'](x, y_ws0 + 0.05, y_ws0 + 0.08)
        if pts:
            D.box(pts[0] + Vector((0.22, 0.02, 0.012)), (0.48, 0.02, 0.012), 0x111111, Matrix.Rotation(-0.12, 3, 'Z'))
    # patentes del Mercosur: blanca con la banda azul arriba
    pz = sp.get('plateZ', (0.42, 0.4))
    for front in (True, False):
        z = pz[0] if front else pz[1]
        c['end_patch'](D, -0.2, 0.2, z - 0.065, z + 0.065, front, 0xf2f2f2, off=0.01, nx=2, nz=1)
        c['end_patch'](D, -0.2, 0.2, z + 0.045, z + 0.065, front, 0x1f4fa8, off=0.012, nx=2, nz=1)
    # butacas, tablero y volante (a la izquierda: en la Argentina se maneja del lado izquierdo)
    seat = sp.get('seat', 0x2b2b2b)
    yS = lerp(y_ws1, st[k['rr']]['y'], 0.45) if not sp.get('open') else lerp(y_ws1, st[k['rr']]['y'], 0.5)
    zf = sp.get('seatZ', st[k['ws0']]['zb'] + 0.1)
    roof = st[k['ws1']]['zt'] if not sp.get('open') else st[k['ws0']]['zs'] + 0.45
    hb = max(0.45, roof - zf - 0.12)
    for sx in (-1, 1):
        x = sx * W2 * 0.42
        D.box((x, yS, zf + 0.1), (0.5, 0.52, 0.12), seat)
        D.box((x, yS + 0.27, zf + 0.12 + hb * 0.36), (0.48, 0.12, hb * 0.6), seat, Matrix.Rotation(-0.22, 3, 'X'))
        D.box((x, yS + 0.36, zf + 0.12 + hb * 0.78), (0.24, 0.1, hb * 0.17), seat)
    if sp.get('rearSeats'):
        y2 = yS + 0.85
        D.box((0, y2, zf + 0.13), (W2 * 1.5, 0.5, 0.14), seat)
        D.box((0, y2 + 0.25, zf + 0.12 + hb * 0.34), (W2 * 1.5, 0.14, hb * 0.56), seat, Matrix.Rotation(-0.2, 3, 'X'))
    zd = belt - 0.02
    D.box((0, y_ws0 + 0.12, zd), (W2 * 1.85, 0.36, 0.14), sp.get('dash', 0x1e1e1e))
    D.box((0, y_ws0 + 0.35, zd - 0.2), (0.24, 0.5, 0.18), sp.get('dash', 0x1e1e1e))
    xw = W2 * 0.42
    wc = Vector((xw, y_ws0 + 0.42, zd + 0.06))
    D.cyl(wc, 0.18, 0.03, 0x151515, axis='Y', n=16)
    D.cyl(wc + Vector((0, 0.02, 0)), 0.15, 0.04, 0x262626, axis='Y', n=16)


# ---------------------------------------------------------------- los autos

# Ferrucho: el superdeportivo italiano de los 80 (parodia, como los de los GTA). Cuña baja y ancha, la
# cola más ancha que la trompa, faros escamoteables, aletas laterales hasta la toma de aire, rejilla negra
# de punta a punta atrás con las luces detrás y llantas de 5 rayos con tuerca central.
def ferrucho_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    W2 = c['W2']
    # aletas laterales: cinco, de la puerta a la toma, sobre un fondo negro
    for sx in (-1, 1):
        c['side_patch'](D, -0.32, 0.92, 0.4, 0.78, sx, 0x0b0b0b, off=0.004, ny=14, nz=4)
        for j in range(5):
            z = 0.44 + j * 0.077
            pts, nrm = c['side_pts'](-0.3, 0.9, z, sx)
            if len(pts) > 1:
                X.strip(pts, nrm, 0.024, 0.045, 0xffffff)
    # faros escamoteables cerrados: la tapa marcada en el capó
    for sx in (-1, 1):
        x0, x1 = sx * 0.42, sx * 0.78
        for y in (-1.86, -1.56):
            pts, nrm = [], []
            for b in range(7):
                loc, nr = hit(c['bvh'], (lerp(x0, x1, b / 6), y, 3), (0, 0, -1))
                if loc is not None:
                    pts.append(loc)
                    nrm.append(nr)
            if len(pts) > 1:
                D.strip(pts, nrm, 0.008, 0.002, 0x151515, up=Vector((0, 1, 0)))
        for x in (x0, x1):
            pts, nrm = c['top_pts'](x, -1.86, -1.56)
            if len(pts) > 1:
                D.strip(pts, nrm, 0.008, 0.002, 0x151515, up=Vector((1, 0, 0)))
    # trompa: luces de posición y giro en el paragolpes, la boca negra con su rejilla
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.52, sx * 0.8, 0.43, 0.5, True, 0xfff3cf, off=0.006, nx=4, nz=1)
        c['end_patch'](L, sx * 0.8, sx * 0.9, 0.43, 0.5, True, 0xffa000, off=0.006, nx=2, nz=1)
    c['end_patch'](D, -0.6, 0.6, 0.24, 0.36, True, 0x0b0b0b, off=0.004, nx=8, nz=2)
    for j in range(3):
        pts, nrm = c['end_pts'](-0.58, 0.58, 0.26 + j * 0.04, True)
        if len(pts) > 1:
            D.strip(pts, nrm, 0.012, 0.012, 0x1c1c1c)
    # cola: las luces y la rejilla negra encima, de punta a punta
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.38, sx * 0.9, 0.56, 0.74, False, 0xb01010, off=0.004, nx=6, nz=2)
    c['end_patch'](D, -0.38, 0.38, 0.56, 0.74, False, 0x0b0b0b, off=0.004, nx=6, nz=2)
    for j in range(7):
        pts, nrm = c['end_pts'](-0.92, 0.92, 0.565 + j * 0.028, False)
        if len(pts) > 1:
            D.strip(pts, nrm, 0.011, 0.025, 0x141414)
    # escapes: dos por lado, cromados
    for sx in (-1, 1):
        for dx in (0.0, 0.11):
            S.cyl((sx * (0.55 + dx), c['spec']['L'] / 2 - 0.02, 0.3), 0.04, 0.18, 0xdddddd, axis='Y', n=12)
    # rejillas del capó trasero (motor)
    for j in range(6):
        y = 1.05 + j * 0.13
        pts, nrm = [], []
        for b in range(9):
            loc, nr = hit(c['bvh'], (lerp(-0.55, 0.55, b / 8), y, 3), (0, 0, -1))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        if len(pts) > 1:
            D.strip(pts, nrm, 0.05, 0.003, 0x0d0d0d, up=Vector((0, 1, 0)))


FERRUCHO = {
    'name': 'ferrucho',
    'L': 4.48, 'W': 1.98,
    'wheelR': 0.335, 'tireW': 0.27, 'rim': 0.68, 'spokes': 5, 'spokeW': 0.06, 'centerlock': True, 'rimCol': 0xc9c9c9,
    'wheels': [(-0.77, -1.29, 0.335), (0.77, -1.29, 0.335), (-0.81, 1.27, 0.335), (0.81, 1.27, 0.335)],
    'seat': 0xb8875a, 'dash': 0x1b1b1b, 'plateZ': (0.33, 0.47), 'handles': [0.3], 'cpillar': 0,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'ws1', 'rr', 'rw1', 'ra', 'r1', 'r0'],
    'keys': [
        dict(y=-2.24, zb=0.24, zs=0.44, zt=0.47, wb=0.78, wm=0.82, ws=0.8, wt=0.72, cr=0.0),
        dict(y=-2.15, zb=0.16, zs=0.56, zt=0.575, wb=0.88, wm=0.93, ws=0.9, wt=0.82, cr=-0.01),
        dict(y=-1.75, zb=0.14, zs=0.7, zt=0.71, wb=0.93, wm=0.975, ws=0.955, wt=0.86, cr=-0.05),
        dict(y=-1.29, zb=0.135, zs=0.785, zt=0.79, wb=0.94, wm=0.985, ws=0.965, wt=0.87, cr=-0.075),
        dict(y=-0.92, zb=0.13, zs=0.78, zt=0.79, wb=0.95, wm=0.99, ws=0.965, wt=0.86, cr=-0.04),
        dict(y=-0.1, zb=0.13, zs=0.8, zt=1.1, wb=0.955, wm=0.99, ws=0.95, wt=0.6, cr=0.03),
        dict(y=0.42, zb=0.13, zs=0.82, zt=1.11, wb=0.96, wm=0.99, ws=0.955, wt=0.6, cr=0.03),
        dict(y=0.72, zb=0.13, zs=0.84, zt=0.99, wb=0.97, wm=0.995, ws=0.97, wt=0.82, cr=0.02),
        dict(y=1.27, zb=0.15, zs=0.86, zt=0.965, wb=0.98, wm=0.995, ws=0.985, wt=0.9, cr=0.015),
        dict(y=2.05, zb=0.19, zs=0.86, zt=0.94, wb=0.97, wm=0.99, ws=0.98, wt=0.91, cr=0.008),
        dict(y=2.24, zb=0.27, zs=0.83, zt=0.88, wb=0.92, wm=0.95, ws=0.94, wt=0.88, cr=0.0),
    ],
    'details': ferrucho_details,
}

# Furia: el superdeportivo de ahora (parodia): cuña filosa y bajísima, tomas de aire enormes adelante y
# a los costados, faros finitos en ángulo, alerón fijo, difusor y escape central; llantas negras de 10 rayos
def furia_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    for sx in (-1, 1):
        # faros: tiras finitas arriba de las puntas, con su marco negro
        c['top_patch'](D, sx * 0.5, sx * 0.88, -2.15, -2.04, 0x0c0c0c, off=0.004, nx=4, ny=1)
        c['top_patch'](L, sx * 0.54, sx * 0.86, -2.13, -2.09, 0xfff3cf, off=0.007, nx=4, ny=1)
        # tomas de adelante y la de atrás de la puerta, con sus aletas
        c['end_patch'](D, sx * 0.42, sx * 0.92, 0.17, 0.36, True, 0x0a0a0a, off=0.005, nx=6, nz=2)
        c['side_patch'](D, 0.42, 0.98, 0.3, 0.74, sx, 0x0a0a0a, off=0.005, ny=8, nz=4)
        for j in range(4):
            pts, nrm = c['side_pts'](0.45, 0.95, 0.36 + j * 0.1, sx)
            if len(pts) > 1:
                D.strip(pts, nrm, 0.018, 0.03, 0x1a1a1a)
    c['end_patch'](D, -0.4, 0.4, 0.13, 0.22, True, 0x0a0a0a, off=0.005, nx=4, nz=1)
    # cola: luces finitas arriba, panel negro y difusor, escape central doble
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.28, sx * 0.97, 0.8, 0.85, False, 0xb01010, off=0.006, nx=8, nz=1)
    c['end_patch'](D, -0.95, 0.95, 0.42, 0.78, False, 0x0d0d0d, off=0.004, nx=10, nz=2)
    c['end_patch'](D, -0.9, 0.9, 0.2, 0.42, False, 0x161616, off=0.006, nx=10, nz=2)
    for dx in (-0.09, 0.09):
        S.cyl((dx, sp['L'] / 2 - 0.04, 0.48), 0.055, 0.14, 0xdddddd, axis='Y', n=6)
    # alerón fijo sobre la tapa del motor
    for sx in (-1, 1):
        X.box((sx * 0.6, 1.98, 1.0), (0.04, 0.12, 0.14), 0x111111)
    X.box((0, 2.0, 1.08), (1.75, 0.3, 0.035), 0xffffff, Matrix.Rotation(-0.08, 3, 'X'))
    for sx in (-1, 1):
        X.box((sx * 0.875, 2.0, 1.05), (0.02, 0.32, 0.1), 0x111111)
    # rejillas de la tapa del motor
    for j in range(5):
        y = 1.0 + j * 0.16
        pts, nrm = [], []
        for b in range(5):
            loc, nr = hit(c['bvh'], (lerp(-0.45, 0.45, b / 4), y, 3), (0, 0, -1))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        if len(pts) > 1:
            D.strip(pts, nrm, 0.07, 0.003, 0x0d0d0d, up=Vector((0, 1, 0)))


FURIA = {
    'name': 'l_furia',
    'L': 4.6, 'W': 2.03,
    'wheelR': 0.355, 'tireW': 0.29, 'rim': 0.72, 'spokes': 10, 'spokeW': 0.035, 'rimCol': 0x1f1f1f, 'caliper': 0xf0b400, 'nutCol': 0x333333,
    'wheels': [(-0.8, -1.3, 0.355), (0.8, -1.3, 0.355), (-0.83, 1.35, 0.355), (0.83, 1.35, 0.355)],
    'seat': 0x1a1a1a, 'dash': 0x141414, 'plateZ': (0.27, 0.32), 'handles': [], 'cpillar': 0, 'aPaint': False, 'blackSill': True,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'ws1', 'rr', 'rw1', 'ra', 'r1', 'r0'],
    'keys': [
        dict(y=-2.3, zb=0.2, zs=0.36, zt=0.38, wb=0.8, wm=0.84, ws=0.82, wt=0.76, cr=0.0),
        dict(y=-2.18, zb=0.12, zs=0.5, zt=0.515, wb=0.92, wm=0.97, ws=0.95, wt=0.87, cr=-0.015),
        dict(y=-1.8, zb=0.11, zs=0.66, zt=0.67, wb=0.95, wm=1.0, ws=0.98, wt=0.89, cr=-0.055),
        dict(y=-1.3, zb=0.11, zs=0.77, zt=0.775, wb=0.96, wm=1.01, ws=0.99, wt=0.9, cr=-0.075),
        dict(y=-0.95, zb=0.11, zs=0.78, zt=0.79, wb=0.96, wm=1.01, ws=0.98, wt=0.86, cr=-0.035),
        dict(y=-0.05, zb=0.11, zs=0.83, zt=1.13, wb=0.96, wm=1.01, ws=0.94, wt=0.58, cr=0.025, gs=0.35),
        dict(y=0.4, zb=0.11, zs=0.87, zt=1.13, wb=0.98, wm=1.02, ws=0.95, wt=0.58, cr=0.025, gs=0.35),
        dict(y=0.95, zb=0.11, zs=0.9, zt=0.99, wb=1.0, wm=1.03, ws=0.99, wt=0.78, cr=0.01),
        dict(y=1.35, zb=0.13, zs=0.92, zt=0.97, wb=1.0, wm=1.03, ws=1.0, wt=0.86, cr=0.0),
        dict(y=2.05, zb=0.2, zs=0.9, zt=0.935, wb=0.98, wm=1.01, ws=0.99, wt=0.9, cr=0.0),
        dict(y=2.3, zb=0.3, zs=0.86, zt=0.885, wb=0.93, wm=0.96, ws=0.95, wt=0.88, cr=0.0),
    ],
    'details': furia_details,
}


# GT: el gran turismo de motor adelante (parodia): capó larguísimo, habitáculo atrás, cola en fastback con
# las caderas anchas, parrilla grande con marco cromado, faros finitos y branquias detrás de las ruedas
def gt_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    # parrilla: fondo negro, marco cromado y varillas
    c['end_patch'](D, -0.48, 0.48, 0.24, 0.48, True, 0x0b0b0b, off=0.005, nx=8, nz=2)
    for z in (0.24, 0.48):
        pts, nrm = c['end_pts'](-0.5, 0.5, z, True)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.02, 0.012, 0xdddddd)
    for j in range(4):
        pts, nrm = c['end_pts'](-0.46, 0.46, 0.29 + j * 0.05, True)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.006, 0.008, 0xbbbbbb)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.52, sx * 0.84, 0.5, 0.57, True, 0xfff3cf, off=0.006, nx=4, nz=1)
        c['end_patch'](D, sx * 0.62, sx * 0.86, 0.2, 0.3, True, 0x0b0b0b, off=0.005, nx=3, nz=1)
        # branquias detrás de la rueda de adelante
        c['side_patch'](D, -1.0, -0.72, 0.5, 0.62, sx, 0x0b0b0b, off=0.004, ny=4, nz=1)
        pts, nrm = c['side_pts'](-1.02, -0.7, 0.56, sx)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.012, 0.01, 0xdddddd)
        # luces de atrás: finitas, envolviendo la cola
        c['end_patch'](T, sx * 0.36, sx * 0.9, 0.8, 0.87, False, 0xb01010, off=0.006, nx=6, nz=1)
        for dx in (0.45, 0.58):
            S.cyl((sx * dx, sp['L'] / 2 - 0.05, 0.3), 0.045, 0.16, 0xdddddd, axis='Y', n=12)
    c['end_patch'](D, -0.85, 0.85, 0.22, 0.36, False, 0x121212, off=0.005, nx=8, nz=1)
    # moldura cromada de las ventanillas
    k = c['body'].k
    st = c['body'].st
    for sx in (-1, 1):
        pts, nrm = c['side_pts'](st[k['ws1']]['y'] - 0.05, st[k['rr']]['y'] + 0.15, st[k['ws1']]['zs'] + 0.025, sx)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.012, 0.006, 0xdddddd)


GT = {
    'name': 'l_gt',
    'L': 4.75, 'W': 1.97,
    'wheelR': 0.35, 'tireW': 0.27, 'rim': 0.7, 'spokes': 'malla', 'rimCol': 0xc4c4c4, 'caliper': 0xb01010,
    'wheels': [(-0.8, -1.46, 0.35), (0.8, -1.46, 0.35), (-0.81, 1.35, 0.35), (0.81, 1.35, 0.35)],
    'seat': 0x5a3320, 'dash': 0x1b1b1b, 'plateZ': (0.36, 0.5), 'handles': [0.0], 'chromeHandles': True, 'cpillar': 0, 'rearSeats': False,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'ws1', 'rr', 'ra', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.375, zb=0.24, zs=0.5, zt=0.54, wb=0.78, wm=0.82, ws=0.8, wt=0.72, cr=0.0),
        dict(y=-2.27, zb=0.15, zs=0.62, zt=0.655, wb=0.86, wm=0.92, ws=0.9, wt=0.8, cr=0.005),
        dict(y=-1.9, zb=0.13, zs=0.72, zt=0.75, wb=0.92, wm=0.97, ws=0.95, wt=0.85, cr=0.0),
        dict(y=-1.46, zb=0.13, zs=0.8, zt=0.81, wb=0.94, wm=0.985, ws=0.965, wt=0.87, cr=-0.025),
        dict(y=-0.55, zb=0.13, zs=0.87, zt=0.885, wb=0.95, wm=0.985, ws=0.95, wt=0.83, cr=0.0),
        dict(y=0.25, zb=0.13, zs=0.9, zt=1.27, wb=0.95, wm=0.985, ws=0.92, wt=0.6, cr=0.03, gs=0.38),
        dict(y=0.75, zb=0.13, zs=0.92, zt=1.25, wb=0.96, wm=0.99, ws=0.93, wt=0.58, cr=0.03, gs=0.38),
        dict(y=1.35, zb=0.15, zs=0.95, zt=1.07, wb=0.98, wm=1.0, ws=0.98, wt=0.76, cr=0.02),
        dict(y=1.72, zb=0.17, zs=0.94, zt=0.985, wb=0.96, wm=0.99, ws=0.97, wt=0.86, cr=0.012),
        dict(y=2.15, zb=0.22, zs=0.9, zt=0.93, wb=0.93, wm=0.97, ws=0.95, wt=0.86, cr=0.0),
        dict(y=2.375, zb=0.3, zs=0.84, zt=0.865, wb=0.86, wm=0.9, ws=0.88, wt=0.8, cr=0.0),
    ],
    'details': gt_details,
}


# Sedán ejecutivo (parodia de los alemanes grandes): largo, cuatro puertas, parrilla cromada con varillas,
# moldura cromada en las ventanillas y manijas cromadas
def sedan_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.34, 0.34, 0.5, 0.8, True, 0x0b0b0b, off=0.005, nx=6, nz=3)
    for j in range(9):
        x = -0.3 + j * 0.075
        pts, nrm = [], []
        for zz in (0.52, 0.65, 0.78):
            loc, nr = hit(c['bvh'], (x, -sp['L'] / 2 - 1, zz), (0, 1, 0))
            if loc is not None:
                pts.append(loc)
                nrm.append(nr)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.012, 0.012, 0xdddddd, up=Vector((1, 0, 0)))
    for z in (0.5, 0.8):
        pts, nrm = c['end_pts'](-0.36, 0.36, z, True)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.022, 0.014, 0xdddddd)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.44, sx * 0.84, 0.7, 0.8, True, 0xfff3cf, off=0.006, nx=4, nz=1)
        c['end_patch'](D, sx * 0.5, sx * 0.86, 0.28, 0.38, True, 0x0b0b0b, off=0.005, nx=3, nz=1)
        c['end_patch'](T, sx * 0.42, sx * 0.9, 0.82, 0.95, False, 0xb01010, off=0.006, nx=5, nz=1)
        for dx in (0.55,):
            S.cyl((sx * dx, sp['L'] / 2 - 0.06, 0.3), 0.05, 0.16, 0xdddddd, axis='Y', n=12)
    pts, nrm = c['end_pts'](-0.42, 0.42, 0.88, False)
    if len(pts) > 1:
        S.strip(pts, nrm, 0.03, 0.008, 0xdddddd)
    # moldura cromada de las ventanillas (abajo) y del techo
    k = c['body'].k
    st = c['body'].st
    for sx in (-1, 1):
        pts, nrm = c['side_pts'](st[k['ws1']]['y'] - 0.1, st[k['rr']]['y'] + 0.1, st[k['ws1']]['zs'] + 0.02, sx)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.014, 0.006, 0xdddddd)
        pts, nrm = c['side_pts'](st[k['fa']]['y'] + 0.4, st[k['ra']]['y'] - 0.45, 0.42, sx)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.012, 0.005, 0xcccccc)


SEDAN = {
    'name': 'l_sedan',
    'L': 5.15, 'W': 1.92,
    'wheelR': 0.35, 'tireW': 0.25, 'rim': 0.68, 'spokes': 'malla', 'rimCol': 0xcfcfcf,
    'wheels': [(-0.8, -1.63, 0.35), (0.8, -1.63, 0.35), (-0.8, 1.48, 0.35), (0.8, 1.48, 0.35)],
    'seat': 0xc9b79c, 'dash': 0x2a2018, 'plateZ': (0.42, 0.62), 'handles': [-0.15, 0.85], 'chromeHandles': True,
    'pillars': [0.42], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.3,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'ws1', 'rr', 'ra', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.575, zb=0.28, zs=0.62, zt=0.66, wb=0.8, wm=0.84, ws=0.82, wt=0.76, cr=0.0),
        dict(y=-2.47, zb=0.18, zs=0.74, zt=0.78, wb=0.88, wm=0.93, ws=0.91, wt=0.84, cr=0.01),
        dict(y=-2.1, zb=0.17, zs=0.84, zt=0.87, wb=0.92, wm=0.955, ws=0.94, wt=0.87, cr=0.02),
        dict(y=-1.63, zb=0.17, zs=0.88, zt=0.91, wb=0.93, wm=0.96, ws=0.945, wt=0.87, cr=0.02),
        dict(y=-0.95, zb=0.17, zs=0.95, zt=0.98, wb=0.93, wm=0.96, ws=0.94, wt=0.85, cr=0.02),
        dict(y=-0.25, zb=0.17, zs=0.99, zt=1.45, wb=0.93, wm=0.96, ws=0.92, wt=0.66, cr=0.035, gs=0.4),
        dict(y=1.15, zb=0.17, zs=1.0, zt=1.44, wb=0.93, wm=0.96, ws=0.92, wt=0.66, cr=0.035, gs=0.4),
        dict(y=1.48, zb=0.18, zs=1.0, zt=1.24, wb=0.93, wm=0.96, ws=0.925, wt=0.74, cr=0.03),
        dict(y=1.75, zb=0.18, zs=1.0, zt=1.04, wb=0.93, wm=0.96, ws=0.93, wt=0.84, cr=0.02),
        dict(y=2.35, zb=0.22, zs=0.99, zt=1.03, wb=0.92, wm=0.95, ws=0.93, wt=0.86, cr=0.01),
        dict(y=2.575, zb=0.3, zs=0.92, zt=0.96, wb=0.86, wm=0.9, ws=0.88, wt=0.82, cr=0.0),
    ],
    'details': sedan_details,
}


# 4x4 de lujo (parodia de las inglesas): caja alta y cuadrada, techo "flotante" negro con las columnas
# negras, parrilla grande, cubrecárter plateado, barras en el techo y llantas grandes de 6 rayos
def suv_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.5, 0.5, 0.62, 0.86, True, 0x0b0b0b, off=0.005, nx=8, nz=2)
    for j in range(5):
        pts, nrm = c['end_pts'](-0.48, 0.48, 0.65 + j * 0.045, True)
        if len(pts) > 1:
            S.strip(pts, nrm, 0.012, 0.01, 0x9a9a9a)
    c['end_patch'](S, -0.55, 0.55, 0.3, 0.42, True, 0xb5b5b5, off=0.006, nx=6, nz=1)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.55, sx * 0.9, 0.88, 0.97, True, 0xfff3cf, off=0.006, nx=4, nz=1)
        c['end_patch'](D, sx * 0.6, sx * 0.9, 0.45, 0.56, True, 0x0b0b0b, off=0.005, nx=3, nz=1)
        c['end_patch'](T, sx * 0.5, sx * 0.92, 1.0, 1.12, False, 0xb01010, off=0.006, nx=5, nz=1)
        S.cyl((sx * 0.62, sp['L'] / 2 - 0.05, 0.42), 0.045, 0.14, 0xdddddd, axis='Y', n=12)
        # barras del techo
        k = c['body'].k
        st = c['body'].st
        y0, y1 = st[k['ws1']]['y'] + 0.2, st[k['rr']]['y'] - 0.1
        pts, nrm = [], []
        for j in range(6):
            y = lerp(y0, y1, j / 5)
            loc, nr = hit(c['bvh'], (sx * 0.72, y, 3), (0, 0, -1))
            if loc is not None:
                pts.append(loc + Vector((0, 0, 0.04)))
                nrm.append(Vector((0, 0, 1)))
        if len(pts) > 1:
            S.strip(pts, nrm, 0.035, 0.03, 0x8a8a8a, up=Vector((1, 0, 0)))
            for p in (pts[0], pts[-1]):
                D.box(p - Vector((0, 0, 0.02)), (0.04, 0.08, 0.05), 0x111111)
    c['end_patch'](D, -0.9, 0.9, 0.35, 0.55, False, 0x141414, off=0.005, nx=8, nz=1)
    c['end_patch'](S, -0.45, 0.45, 0.36, 0.44, False, 0xb5b5b5, off=0.008, nx=4, nz=1)


SUV = {
    'name': 'l_suv',
    'L': 4.95, 'W': 2.0,
    'wheelR': 0.4, 'tireW': 0.28, 'rim': 0.68, 'spokes': 6, 'spokeW': 0.07, 'rimCol': 0xb8b8b8,
    'wheels': [(-0.82, -1.53, 0.4), (0.82, -1.53, 0.4), (-0.82, 1.43, 0.4), (0.82, 1.43, 0.4)],
    'seat': 0xe6dccb, 'dash': 0x1b1b1b, 'plateZ': (0.6, 0.8), 'handles': [-0.3, 0.75], 'chromeHandles': True,
    'pillars': [0.42, 1.52], 'cpillar': 0, 'cPaint': False, 'aPaint': False, 'roofBlack': True, 'rearSeats': True, 'seatZ': 0.48,
    'blackSill': True, 'arch': 0.07,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'ws1', 'rr', 'rw1', 'r0'],
    'keys': [
        dict(y=-2.475, zb=0.42, zs=0.86, zt=0.93, wb=0.82, wm=0.86, ws=0.84, wt=0.8, cr=0.0),
        dict(y=-2.36, zb=0.32, zs=1.0, zt=1.06, wb=0.9, wm=0.95, ws=0.93, wt=0.88, cr=0.01),
        dict(y=-2.0, zb=0.29, zs=1.08, zt=1.12, wb=0.94, wm=0.98, ws=0.96, wt=0.9, cr=0.02),
        dict(y=-1.53, zb=0.28, zs=1.1, zt=1.14, wb=0.95, wm=0.99, ws=0.97, wt=0.91, cr=0.02),
        dict(y=-0.95, zb=0.28, zs=1.12, zt=1.16, wb=0.95, wm=0.99, ws=0.97, wt=0.9, cr=0.02),
        dict(y=-0.38, zb=0.28, zs=1.15, zt=1.8, wb=0.95, wm=0.99, ws=0.95, wt=0.82, cr=0.02, gs=0.45),
        dict(y=2.15, zb=0.28, zs=1.15, zt=1.8, wb=0.95, wm=0.99, ws=0.95, wt=0.82, cr=0.02, gs=0.45),
        dict(y=2.4, zb=0.32, zs=1.12, zt=1.68, wb=0.93, wm=0.97, ws=0.94, wt=0.8, cr=0.01),
        dict(y=2.475, zb=0.42, zs=1.08, zt=1.62, wb=0.9, wm=0.94, ws=0.92, wt=0.78, cr=0.0),
    ],
    'details': suv_details,
}


# el descapotable (el amarillo de Laban): sin techo, con el parabrisas más bajo
FERRUCHO_OPEN = {**FERRUCHO, 'name': 'ferrucho_open', 'open': True, 'rearGlass': False,
                 'keys': [dict(k, zt=k['zs'] + 0.26, wt=0.66, cr=0.01) if i == 5 else dict(k, zt=k['zs'] + 0.03, wt=k['ws'] - 0.06, cr=0.0) if i == 6 else k
                          for i, k in enumerate(FERRUCHO['keys'])]}

CARS = [FERRUCHO, FERRUCHO_OPEN, FURIA, GT, SEDAN, SUV]
if os.environ.get('AUTOS_SOLO'):
    CARS = [c for c in CARS if c['name'] in os.environ['AUTOS_SOLO'].split(',')]


# ---------------------------------------------------------------- sombra horneada, foto y exportación


def bake(ob):
    me = ob.data
    if not me.polygons:
        return
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = [0.35 + 0.65 * d.color[0] for d in ca.data]
    me.color_attributes.remove(ca)
    # la sombra, promediada por vértice: las esquinas de un mismo vértice quedan iguales y el glTF no lo
    # parte (salvo donde cambia el color de la paleta), así pesa mucho menos
    acc = [0.0] * len(me.vertices)
    cnt = [0] * len(me.vertices)
    for li, lp in enumerate(me.loops):
        acc[lp.vertex_index] += ao[li]
        cnt[lp.vertex_index] += 1
    vao = [round(a / max(1, n), 2) for a, n in zip(acc, cnt)]
    pal = list(ob['palette'])
    pal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    ci = me.attributes['ci']
    col = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = pal[ci.data[poly.index].value]
        for li in poly.loop_indices:
            a = vao[me.loops[li].vertex_index]
            col.data[li].color = (c[0] * a, c[1] * a, c[2] * a, 1)
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['ci'])
    me.materials.clear()


def plain_colors(ob):
    # sin sombra (luces, ruedas): solo la paleta
    me = ob.data
    if 'ci' not in me.attributes:
        return
    pal = list(ob['palette'])
    pal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    ci = me.attributes['ci']
    col = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = pal[ci.data[poly.index].value]
        for li in poly.loop_indices:
            col.data[li].color = (*c, 1)
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['ci'])


def smooth(ob, angle=40):
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.world = bpy.data.worlds.new('w')
scene.world.light_settings.distance = 0.6
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.mesh.primitive_plane_add(size=30)
floor = bpy.context.active_object
floor.name = 'piso'
roots = []
for spec in CARS:
    parts = build_car(spec)
    for ob in parts.values():
        smooth(ob, 35 if ob.name in ('paint', 'glass') else 30)
    # la sombra: la chapa y los detalles con las cuatro ruedas puestas y el piso; sin los vidrios
    temp = []
    for (x, y, z) in spec['wheels']:
        t = parts['wheel'].copy()
        t.data = parts['wheel'].data
        t.location = (x, y, z)
        if x < 0:
            t.scale.x = -1
        scene.collection.objects.link(t)
        temp.append(t)
    others = [o for o in scene.objects if o not in parts.values() and o not in temp and o is not floor]
    for o in others:
        o.hide_render = True
    parts['glass'].hide_render = True
    parts['wheel'].hide_render = True
    for name in ('paint', 'detail', 'shiny'):
        bake(parts[name])
    parts['glass'].hide_render = False
    for o in temp:
        bpy.data.objects.remove(o)
    parts['wheel'].hide_render = False
    for o in others:
        o.hide_render = False
    # la rueda, sola (gira: la sombra del arco no le corresponde)
    for o in scene.objects:
        o.hide_render = o is not parts['wheel']
    bake(parts['wheel'])
    for o in scene.objects:
        o.hide_render = False
    for name in ('lights', 'tail'):
        plain_colors(parts[name])
    root = bpy.data.objects.new(spec['name'], None)
    scene.collection.objects.link(root)
    for ob in parts.values():
        ob.parent = root
    # dónde van las ruedas, en el sistema del juego (y arriba, frente a +z): x, y, -y de Blender
    root['wheels'] = [[x, z, -y] for (x, y, z) in spec['wheels']]
    root['wheelR'] = spec['wheelR']
    zmax = max(v.co.z for v in parts['paint'].data.vertices)
    root['size'] = [spec['W'], zmax, spec['L']]
    roots.append((root, parts))
    print(spec['name'], {n: tris(o) for n, o in parts.items()}, flush=True)

bpy.data.objects.remove(floor)

if VISTA:
    os.makedirs(OUT_VISTA, exist_ok=True)
    scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.view_settings.view_transform = 'Standard'
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=40)
    gnd = bpy.context.active_object
    gnd.data.materials.append(mat('suelo', hexc(0x8a8680), 0.9))
    looks = {
        'paint': lambda: mat('v_paint', hexc(0xc8102e), 0.25, 0.0),
        'glass': lambda: mat('v_glass', hexc(0x0b1015), 0.05, 0.0, 0.6),
        'detail': lambda: mat('v_vc', (1, 1, 1), 0.5),
        'shiny': lambda: mat('v_shiny', (1, 1, 1), 0.15, 1.0),
        'lights': lambda: mat('v_vc2', (1, 1, 1), 0.3),
        'tail': lambda: mat('v_vc3', (1, 1, 1), 0.3),
        'wheel': lambda: mat('v_vc4', (1, 1, 1), 0.4, 0.3),
    }
    # (los colores de los vértices entran al color base; la chapa, multiplicada por un rojo)
    for root, parts in roots:
        for o in scene.objects:
            o.hide_render = o.parent is not None and o.parent is not root
        temp = []
        for name, ob in parts.items():
            m = looks[name]()
            if name != 'glass' and not m.get('vc'):
                nt = m.node_tree
                attr = nt.nodes.new('ShaderNodeVertexColor')
                attr.layer_name = 'col'
                b = nt.nodes['Principled BSDF']
                if name == 'paint':
                    mix = nt.nodes.new('ShaderNodeMix')
                    mix.data_type = 'RGBA'
                    mix.blend_type = 'MULTIPLY'
                    mix.inputs['Factor'].default_value = 1
                    mix.inputs[6].default_value = (*hexc(0xc8102e), 1)
                    nt.links.new(attr.outputs['Color'], mix.inputs[7])
                    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
                else:
                    nt.links.new(attr.outputs['Color'], b.inputs['Base Color'])
                m['vc'] = 1
            ob.data.materials.clear()
            ob.data.materials.append(m)
        spec = next(s for s in CARS if s['name'] == root.name)
        for (x, y, z) in spec['wheels']:
            t = parts['wheel'].copy()
            t.data = parts['wheel'].data
            t.parent = None
            t.location = (x, y, z)
            if x < 0:
                t.scale.x = -1
            scene.collection.objects.link(t)
            temp.append(t)
        parts['wheel'].hide_render = True
        if os.environ.get('AUTOS_SIN_RUEDAS'):
            for t in temp:
                t.hide_render = True
        for i, (az, el, dist) in enumerate(((-35, 14, 6.4), (145, 18, 6.6), (-90, 6, 6.8), (180, 8, 4.2))):
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
            scene.collection.objects.link(cam)
            a, e = math.radians(az), math.radians(el)
            target = Vector((0, 0, 0.55))
            cam.location = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
            cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
            cam.data.lens = 50
            scene.camera = cam
            scene.render.filepath = os.path.join(OUT_VISTA, f'{root.name}-{i}.png')
            bpy.ops.render.render(write_still=True)
            bpy.data.objects.remove(cam)
        for t in temp:
            bpy.data.objects.remove(t)
        parts['wheel'].hide_render = False
        for ob in parts.values():
            ob.data.materials.clear()
    bpy.data.objects.remove(gnd)
    bpy.data.objects.remove(sun)

for o in scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_extras=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
# normales y colores en enteros (KHR_mesh_quantization, three.js lo lee sin decodificador): pesa la mitad.
# Las posiciones quedan en float (las abolladuras de src/cars.js trabajan en metros)
import subprocess  # noqa: E402

try:
    subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'quantize', GLB, GLB, '--pattern', '{NORMAL,COLOR_0}', '--quantize-normal', '8'], check=True, capture_output=True, timeout=300)
except Exception as e:
    print('(sin cuantizar:', e, ')')
print('listo:', GLB, os.path.getsize(GLB) // 1024, 'KB')
