# Repintado de la ropa de MakeHuman: en vez de usar la foto original (con logos de MakeHuman en las
# remeras), la parte de arriba se pinta de nuevo con el sombreado de la prenda (oclusión + pliegues del
# mapa de normales) y un dibujo que se calcula sobre el cuerpo en 3D: color liso, rayas verticales de
# camiseta de fútbol, franja horizontal, banda cruzada, uniforme con parches… La de abajo (jean) cambia
# de color conservando el gastado. Todo en el espacio de la textura de la prenda.
import numpy as np
from PIL import Image

UPPER = {'Spine', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'}
LOWER = {'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'}


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def islands(F, FT):
    """Islas de la textura: caras que comparten coordenadas uv."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for ft in FT:
        for t in ft[1:]:
            ra, rb = find(ft[0]), find(t)
            if ra != rb:
                parent[ra] = rb
    roots = {}
    return np.array([roots.setdefault(find(ft[0]), len(roots)) for ft in FT])


ARMS = {'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'}


def classify(clo, Wv, names):
    """Cada isla es 'top' (torso y brazos) o 'bottom' (piernas), según los huesos que la mueven.
    Devuelve la isla de cada cara, si cada isla es de arriba y si es manga (brazos)."""
    up = np.array([n in UPPER for n in names])
    lo = np.array([n in LOWER for n in names])
    arm = np.array([n in ARMS for n in names])
    isl = islands(clo['F'], clo['FT'])
    score = np.zeros(isl.max() + 1)
    arms = np.zeros(isl.max() + 1)
    for fi, f in enumerate(clo['F']):
        w = Wv[f]
        score[isl[fi]] += (w[:, up].sum() - w[:, lo].sum()) / len(f)
        arms[isl[fi]] += (w[:, arm].sum() - w[:, up & ~arm].sum()) / len(f)
    classify.sleeve = (score > 0) & (arms > 0)
    return isl, score > 0


def raster(clo, P, size, face_ok=None):
    """Mapa de posiciones: para cada píxel de la textura, el punto 3D de la prenda (y qué cara es)."""
    T = clo['T']
    pos = np.zeros((size, size, 3), np.float32)
    nrm = np.zeros((size, size, 3), np.float32)
    face = np.full((size, size), -1, np.int32)
    # normales por vértice (para el dibujo de los pliegues no hace falta, pero sí para la banda)
    for fi, (f, ft) in enumerate(zip(clo['F'], clo['FT'])):
        if face_ok is not None and not face_ok[fi]:
            continue
        for k in range(1, len(f) - 1):
            ids = [0, k, k + 1]
            uv = np.array([T[ft[i]] for i in ids]) * [size, size]
            uv[:, 1] = size - uv[:, 1]
            p = np.array([P[f[i]] for i in ids])
            x0, y0 = np.floor(uv.min(0)).astype(int)
            x1, y1 = np.ceil(uv.max(0)).astype(int)
            x0, y0 = max(x0, 0), max(y0, 0)
            x1, y1 = min(x1, size - 1), min(y1, size - 1)
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            a, b, c = uv
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            l3 = 1 - l1 - l2
            m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            if not m.any():
                continue
            q = l1[..., None] * p[0] + l2[..., None] * p[1] + l3[..., None] * p[2]
            n = np.cross(p[1] - p[0], p[2] - p[0])
            n = n / (np.linalg.norm(n) + 1e-12)
            ys, xs = np.nonzero(m)
            pos[ys + y0, xs + x0] = q[m]
            nrm[ys + y0, xs + x0] = n
            face[ys + y0, xs + x0] = fi
    return pos, nrm, face


def raster_tris(uvpx, vals, size):
    """Pinta triángulos (uv en píxeles, imagen con y para abajo) interpolando vals (T, 3, C)."""
    out = np.zeros((size, size, vals.shape[2]), np.float32)
    mask = np.zeros((size, size), bool)
    for tri, val in zip(uvpx, vals):
        x0, y0 = np.maximum(np.floor(tri.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(tri.max(0)).astype(int), size - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = tri
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:
            continue
        l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
        l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
        l3 = 1 - l1 - l2
        m = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
        if not m.any():
            continue
        q = l1[..., None] * val[0] + l2[..., None] * val[1] + l3[..., None] * val[2]
        ys, xs = np.nonzero(m)
        out[ys + y0, xs + x0] = q[m]
        mask[ys + y0, xs + x0] = True
    return out, mask


def noise3(p, seed=0):
    """Ruido de valor 3D (0..1) con interpolación suave, para pliegues de tela."""
    rng = np.random.default_rng(seed)
    perm = rng.permutation(256)
    vals = rng.random(256)
    i = np.floor(p).astype(int)
    f = p - i
    f = f * f * (3 - 2 * f)

    def h(x, y, z):
        return vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]]

    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * h(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz)
    return out


def erode(mask, n):
    m = mask.copy()
    for _ in range(n):
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    return m


def dilate(arr, mask, n):
    """Corre los valores de lo pintado hacia afuera n píxeles (que el filtrado no traiga el fondo)."""
    arr = arr.copy()
    mask = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(arr)
        cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m = np.roll(mask, (dy, dx), (0, 1))
            acc += np.roll(arr, (dy, dx), (0, 1)) * m[..., None]
            cnt += m
        new = (~mask) & (cnt > 0)
        arr[new] = acc[new] / cnt[new][:, None]
        mask = mask | new
    return arr, mask


def shade(clo, size, pos, mask):
    """Sombreado de la prenda sin colores: oclusión ambiente, pliegues (del mapa de normales y, como las
    remeras lo traen liso, también de un ruido estirado en 3D: arrugas más bien horizontales) y
    costuras más oscuras en los bordes de cada pieza (dobladillos, cuello, puños)."""
    s = np.ones((size, size), np.float32)
    d = clo['dir']
    name = clo['name']
    ao = d / f'{name}_ao.png'
    if ao.exists():
        a = np.asarray(Image.open(ao).convert('L').resize((size, size), Image.BILINEAR), np.float32) / 255
        a = a / max(np.percentile(a, 92), 0.2)
        s *= np.clip(a, 0, 1.05) ** 1.5
    nm = d / f'{name}_normal.png'
    if nm.exists():
        n = np.asarray(Image.open(nm).convert('RGB').resize((size, size), Image.BILINEAR), np.float32) / 255 * 2 - 1
        L = np.array([0.25, 0.45, 0.86])
        L = L / np.linalg.norm(L)
        lit = np.clip(n @ L, 0, 1)
        s *= 0.55 + 0.5 * lit / max(np.percentile(lit, 70), 0.3)
    else:
        # sin mapas: el detalle sale de la luminancia de la foto
        img = np.asarray(Image.open(d / f'{name}_diffuse.png').convert('L').resize((size, size), Image.BILINEAR), np.float32) / 255
        s *= img / max(np.median(img), 0.05)
    # arrugas: crestas de un ruido que cambia rápido en altura y lento alrededor
    q = pos * [9, 26, 9]
    f = noise3(q, 3) * 0.65 + noise3(q * 2.1 + 5, 4) * 0.35
    ridge = 1 - np.abs(f * 2 - 1)
    s *= 0.9 + 0.17 * ridge ** 2
    # costuras y bordes
    e1 = mask & ~erode(mask, 2)
    e2 = mask & ~erode(mask, 5)
    s *= np.where(e1, 0.72, np.where(e2, 0.9, 1.0))
    return s


def pattern(spec, pos, nrm):
    """Color de cada píxel según el dibujo pedido, calculado sobre el cuerpo (x a la izquierda del
    personaje, y para arriba, z hacia adelante; en metros con el piso en 0)."""
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    c1 = hexrgb(spec.get('color', '#ffffff'))
    c2 = hexrgb(spec.get('color2', '#ffffff'))
    kind = spec.get('pattern', 'solid')
    out = np.broadcast_to(c1, pos.shape).copy()

    def put(m, c):
        out[m] = c

    if kind == 'stripes':
        # rayas verticales (alrededor del cuerpo: se usa el ángulo, así siguen por los costados)
        w = spec.get('width', 0.055)
        ang = np.arctan2(x, z) * 0.16
        put(np.mod(ang, 2 * w) < w, c2)
    elif kind == 'hoops':
        w = spec.get('width', 0.06)
        put(np.mod(y, 2 * w) < w, c2)
    elif kind == 'band':
        # franja horizontal en el pecho (la de Boca)
        y0, y1 = spec.get('band', (1.22, 1.34))
        put((y > y0) & (y < y1), c2)
    elif kind == 'sash':
        # banda cruzada de un hombro a la cadera (la de River), adelante y atrás
        s = y + x * 1.1
        put(np.abs(s - spec.get('at', 1.28)) < spec.get('width', 0.07), c2)
    elif kind == 'halves':
        put(x < 0, c2)
    elif kind == 'yoke':
        # hombros de otro color (camperas, uniformes)
        put(y > spec.get('at', 1.42), c2)
    # mangas: de un solo color (como las camisetas de verdad), salvo que se pida otro
    arms = np.abs(x) > spec.get('shoulder', 0.19)
    if kind in ('stripes', 'sash', 'halves', 'band', 'hoops') or 'sleeves' in spec:
        put(arms, hexrgb(spec.get('sleeves', spec.get('color', '#ffffff'))))
    trim = spec.get('trim')
    if trim:
        # puños y cuello de otro color: lo más alto (cuello) y la punta de las mangas
        t = hexrgb(trim)
        put(y > spec.get('neck', 1.5), t)
    return out


def repaint(clo, P, Wv, names, spec, size=1024):
    """Textura nueva para la prenda (imagen PIL de size×size)."""
    base = np.asarray(Image.open(clo['dir'] / f"{clo['name']}_diffuse.png").convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255
    lin = base ** 2.2
    isl, top = classify(clo, Wv, names)
    ftop = top[isl]
    out = lin.copy()
    for which, sel in (('top', ftop), ('bottom', ~ftop)):
        sp = spec.get(which)
        if not sp:
            continue
        pos, nrm, face = raster(clo, P, size, sel)
        m = face >= 0
        pos, m2 = dilate(pos, m, 6)
        nrm, _ = dilate(nrm, m, 6)
        sh = shade(clo, size, pos, m)
        if sp.get('keep'):
            # mismo dibujo que la foto, solo otro color (jean negro, pantalón beige…)
            lum = lin @ [0.2126, 0.7152, 0.0722]
            ref = np.median(lum[m])
            col = hexrgb(sp['color']) ** 2.2
            new = col * np.clip(lum / max(ref, 1e-3), 0, 2.2)[..., None]
        else:
            col = pattern(sp, pos, nrm) ** 2.2
            # una trama de tela muy suave para que no quede plástico
            rng = np.random.default_rng(7)
            noise = 1 + (rng.random((size, size)) - 0.5) * 0.06
            new = col * (sh * noise)[..., None]
        # el borde de afuera (para el filtrado) toma el color de adentro, no el sombreado del fondo
        new, m2 = dilate(np.where(m[..., None], new, 0).astype(np.float32), m, 8)
        out[m2] = new[m2]
    for rc in spec.get('recolor', []):
        out = recolor(out, rc)
    return Image.fromarray((np.clip(out, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)), ftop


def recolor(lin, rc):
    """Cambia el color de lo saturado dentro de un rectángulo de la textura (fracciones x0, y0, x1, y1),
    conservando la luz: la corbata azul a rayas del traje pasa a roja a rayas."""
    size = lin.shape[0]
    x0, y0, x1, y1 = (int(v * size) for v in rc['box'])
    reg = lin[y0:y1, x0:x1]
    srgb = reg ** (1 / 2.2)
    mx, mn = srgb.max(2), srgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    m = np.clip((sat - rc.get('min_sat', 0.12)) / 0.15, 0, 1)
    lum = reg @ [0.2126, 0.7152, 0.0722]
    col = hexrgb(rc['to']) ** 2.2
    ref = col @ [0.2126, 0.7152, 0.0722]
    new = col * np.clip(lum / max(ref, 1e-4) * rc.get('gain', 1.0), 0, 3)[..., None]
    lin = lin.copy()
    lin[y0:y1, x0:x1] = reg * (1 - m[..., None]) + np.clip(new, 0, 1) * m[..., None]
    return lin


def pad(img, clo, n=24):
    """Corre el color de cada pieza hacia el fondo de la textura (n píxeles a 2048): al achicarla y con
    el mipmap, los bordes (cuello de la camisa, puños) no se manchan con el fondo oscuro."""
    size = 1024
    big = img.size[0]
    T = clo['T']
    tris = []
    for f, ft in zip(clo['F'], clo['FT']):
        for k in range(1, len(f) - 1):
            tris.append([T[ft[0]], T[ft[k]], T[ft[k + 1]]])
    uvpx = np.array(tris) * size
    uvpx[..., 1] = size - uvpx[..., 1]
    _, m = raster_tris(uvpx, np.zeros((len(tris), 3, 1), np.float32), size)
    mode = img.mode
    arr = np.asarray(img.convert('RGBA').resize((size, size), Image.LANCZOS), np.float32) / 255
    full = np.asarray(img.convert('RGBA'), np.float32) / 255
    grown, m2 = dilate(arr, erode(m, 1), max(1, n * size // 2048))
    # solo se toca el fondo: lo de adentro queda con la resolución original
    up = np.asarray(Image.fromarray((grown * 255).astype(np.uint8)).resize((big, big), Image.BILINEAR), np.float32) / 255
    inside = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).resize((big, big), Image.NEAREST)) > 0
    out = np.where(inside[..., None], full, up)
    return Image.fromarray((out * 255).astype(np.uint8)).convert(mode if mode in ('RGB', 'RGBA') else 'RGBA')
