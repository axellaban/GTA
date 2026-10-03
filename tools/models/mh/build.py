# Arma personajes con los assets de MakeHuman (CC0, bajados por fetch.py): cuerpo con los morfos de
# MakeHuman (sexo, edad, músculo, peso, altura, etnia), malla liviana (proxy), ropa, zapatos, pelo,
# cejas, pestañas y ojos ajustados al cuerpo, esqueleto reducido con nombres tipo Mixamo (los que
# entiende src/rig.js) y todas las texturas en un atlas. Deja en cache/out/<nombre>.json + .png
# lo que pack.mjs simplifica y guarda como public/models/people/<nombre>.glb.
#
#   python3 tools/models/mh/build.py [nombre ...]     (sin nombres: todo el elenco)
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from cast import CAST
from paint import classify, pad, repaint
from skin import cavity
from skin import photo as photo_bake

HERE = Path(__file__).resolve().parent
C = HERE / 'cache'
OUT = C / 'out'

# ---------------------------------------------------------------- lectura


def read_obj(path):
    V, T, F, FT = [], [], [], []
    for line in open(path):
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            T.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            idx = [p.split('/') for p in line.split()[1:]]
            F.append([int(p[0]) - 1 for p in idx])
            FT.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in idx])
    return np.array(V, float), np.array(T, float), F, FT


_base = None


def base_mesh():
    global _base
    if _base is None:
        npy = C / 'base.npy'
        if npy.exists():
            _base = np.load(npy)
        else:
            _base = read_obj(C / '3dobjs/base.obj')[0]
            np.save(npy, _base)
    return _base


_targets = {}


def target(name):
    if name not in _targets:
        p = C / 'targets' / (name + '.target')
        if not p.exists():
            _targets[name] = None
        else:
            rows = [l.split() for l in open(p) if l.strip() and not l.startswith('#')]
            idx = np.array([int(r[0]) for r in rows], int)
            d = np.array([[float(x) for x in r[1:4]] for r in rows], float).reshape(-1, 3)
            _targets[name] = (idx, d)
    return _targets[name]


def tri(x, lo, mid, hi):
    # los morfos de MakeHuman: 0 = mínimo, 0,5 = promedio, 1 = máximo
    if x < 0.5:
        return {lo: 1 - 2 * x, mid: 2 * x}
    return {mid: 2 - 2 * x, hi: 2 * x - 1}


def morph(p):
    """La malla base con los modificadores macro de MakeHuman (mismas fórmulas que humanmodifier.py)."""
    V = base_mesh().copy()
    g, age = p['gender'], p['age']
    gw = {'female': 1 - g, 'male': g}
    if age < 0.5:
        young = max(0.0, (age - 0.1875) * 3.2)
        aw = {'baby': max(0.0, 1 - age * 5.333), 'child': max(0.0, min(1.0, 5.333 * age) - young), 'young': young}
    else:
        old = max(0.0, age * 2 - 1)
        aw = {'young': 1 - old, 'old': old}
    mw = tri(p.get('muscle', 0.5), 'minmuscle', 'averagemuscle', 'maxmuscle')
    ww = tri(p.get('weight', 0.5), 'minweight', 'averageweight', 'maxweight')
    h = p.get('height', 0.5)
    pr = p.get('proportions', 0.5)

    def add(name, k):
        if k <= 1e-4:
            return
        t = target(name)
        if t is None:
            print('  falta el morfo', name)
            return
        V[t[0]] += t[1] * k

    for gn, gv in gw.items():
        for an, av in aw.items():
            for mn, mv in mw.items():
                for wn, wv in ww.items():
                    k = gv * av * mv * wv
                    add(f'macrodetails/universal-{gn}-{an}-{mn}-{wn}', k)
                    if h != 0.5:
                        add(f'macrodetails/height/{gn}-{an}-{mn}-{wn}-{"maxheight" if h > 0.5 else "minheight"}', k * abs(2 * h - 1))
                    if pr != 0.5:
                        add(f'macrodetails/proportions/{gn}-{an}-{mn}-{wn}-{"idealproportions" if pr > 0.5 else "uncommonproportions"}', k * abs(2 * pr - 1))
    for en, ev in p.get('ethnic', {'african': 1 / 3, 'asian': 1 / 3, 'caucasian': 1 / 3}).items():
        for gn, gv in gw.items():
            for an, av in aw.items():
                add(f'macrodetails/{en}-{gn}-{an}', ev * gv * av)
    # pecho (copa y firmeza; los morfos bajados son de músculo y peso promedio)
    cup, firm = p.get('cup', 0.5), p.get('firmness', 0.5)
    if cup != 0.5:
        for an in ('young', 'old'):
            for fn, fv in tri(firm, 'minfirmness', 'averagefirmness', 'maxfirmness').items():
                add(f'breast/female-{an}-averagemuscle-averageweight-{"maxcup" if cup > 0.5 else "mincup"}-{fn}', gw['female'] * aw.get(an, 0) * fv * abs(2 * cup - 1))
    # la cara y los detalles: los pedidos a mano y, con 'seed', un rostro al azar (cada uno distinto)
    mods = dict(random_face(p['seed'], p.get('variety', 0.6))) if 'seed' in p else {}
    mods.update(p.get('mods', {}))
    for name, val in mods.items():
        apply_mod(V, name, val)
    return V


_mods = None


def modifiers():
    """Los modificadores de detalle de MakeHuman: nombre → (grupo, target, min, max) o (grupo, target)."""
    global _mods
    if _mods is None:
        _mods = {}
        for g in json.load(open(C / 'modifiers/modeling_modifiers.json')):
            for m in g['modifiers']:
                t = m.get('target')
                if not t:
                    continue
                key = f"{g['group']}/{t}-{m['min']}|{m['max']}" if m.get('min') else f"{g['group']}/{t}"
                _mods[key] = (g['group'], t, m.get('min'), m.get('max'))
    return _mods


def apply_mod(V, name, val):
    """val en -1..1 (0 = sin cambio); los de una sola punta (head-oval…) van de 0 a 1. Los izquierdo/
    derecho van juntos: con 'r-' se aplica también el 'l-'."""
    names = [name]
    if '/r-' in name:
        names.append(name.replace('/r-', '/l-'))
    for n in names:
        g, t, lo, hi = modifiers()[n]
        if lo:
            if abs(val) < 1e-4:
                continue
            rel = f'{g}/{t}-{hi if val > 0 else lo}'
        else:
            rel = f'{g}/{t}'
        tg = target(rel)
        if tg is None:
            print('  falta el morfo', rel)
            continue
        V[tg[0]] += tg[1] * abs(val)


# lo que más cambia una cara (y los costados van juntos: solo se nombra el derecho)
FACE = ['head/head-age-decr|incr', 'head/head-fat-decr|incr', 'head/head-scale-vert-decr|incr', 'head/head-scale-horiz-decr|incr',
        'head/head-oval', 'head/head-round', 'head/head-rectangular', 'head/head-square', 'head/head-triangular', 'head/head-diamond',
        'forehead/forehead-trans-backward|forward', 'forehead/forehead-scale-vert-decr|incr',
        'eyebrows/eyebrows-angle-down|up', 'eyebrows/eyebrows-trans-down|up',
        'nose/nose-trans-down|up', 'nose/nose-scale-horiz-decr|incr', 'nose/nose-scale-vert-decr|incr', 'nose/nose-scale-depth-decr|incr',
        'nose/nose-hump-decr|incr', 'nose/nose-width1-decr|incr', 'nose/nose-point-width-decr|incr', 'nose/nose-flaring-decr|incr',
        'mouth/mouth-scale-horiz-decr|incr', 'mouth/mouth-scale-vert-decr|incr', 'mouth/mouth-lowerlip-volume-decr|incr', 'mouth/mouth-upperlip-volume-decr|incr',
        'mouth/mouth-trans-down|up', 'mouth/mouth-cupidsbow-decr|incr',
        'chin/chin-prominent-decr|incr', 'chin/chin-width-decr|incr', 'chin/chin-height-decr|incr', 'chin/chin-jaw-drop-decr|incr', 'chin/chin-cleft-decr|incr',
        'cheek/r-cheek-volume-decr|incr', 'cheek/r-cheek-bones-decr|incr', 'cheek/r-cheek-inner-decr|incr',
        'eyes/r-eye-scale-decr|incr', 'eyes/r-eye-trans-down|up', 'eyes/r-eye-bag-decr|incr', 'eyes/r-eye-height2-decr|incr', 'eyes/r-eye-push1-in|out',
        'ears/r-ear-scale-decr|incr', 'ears/r-ear-flap-decr|incr', 'ears/r-ear-rot-backward|forward',
        'neck/neck-scale-horiz-decr|incr', 'neck/neck-double-decr|incr']


def random_face(seed, amount):
    rng = np.random.default_rng(seed)
    out = {}
    shapes = [f for f in FACE if '|' not in f]
    out[shapes[rng.integers(len(shapes))]] = rng.uniform(0.2, 0.7) * amount
    for f in FACE:
        if '|' in f and f in modifiers() and rng.random() < 0.7:
            out[f] = float(np.clip(rng.normal(0, 0.45), -1, 1)) * amount
    return out


def read_clo(path):
    """Un .proxy o .mhclo: cada vértice cuelga de 3 vértices de la malla base (pesos + desplazamiento)."""
    info = {'refs': [], 'w': [], 'off': [], 'scale': {}, 'delete': [], 'dir': path.parent}
    mode = None
    num = re.compile(r'^-?\d')
    for raw in open(path):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if mode == 'verts' and num.match(parts[0]):
            if len(parts) == 1:
                v = int(parts[0])
                info['refs'].append([v, v, v])
                info['w'].append([1, 0, 0])
                info['off'].append([0, 0, 0])
            else:
                info['refs'].append([int(x) for x in parts[:3]])
                info['w'].append([float(x) for x in parts[3:6]])
                info['off'].append([float(x) for x in parts[6:9]])
            continue
        if mode == 'delete' and num.match(parts[0]):
            prev = None
            rng = False
            for tok in parts:
                if tok == '-':
                    rng = True
                    continue
                v = int(tok)
                if rng:
                    info['delete'].extend(range(prev + 1, v + 1))
                    rng = False
                else:
                    info['delete'].append(v)
                prev = v
            continue
        key = parts[0]
        if key == 'verts':
            mode = 'verts'
        elif key == 'delete_verts':
            mode = 'delete'
        elif key in ('x_scale', 'y_scale', 'z_scale'):
            info['scale']['xyz'.index(key[0])] = (int(parts[1]), int(parts[2]), float(parts[3]))
        elif key in ('obj_file', 'material', 'name'):
            info[key] = parts[1]
    for k in ('refs', 'w', 'off'):
        info[k] = np.array(info[k], float if k != 'refs' else int)
    obj = read_obj(info['dir'] / info['obj_file'])
    info['V0'], info['T'], info['F'], info['FT'] = obj
    assert len(info['V0']) == len(info['refs']), (path, len(info['V0']), len(info['refs']))
    info['mat'] = {}
    if 'material' in info:
        mp = info['dir'] / info['material']
        if mp.exists():
            for l in open(mp):
                ps = l.split()
                if len(ps) >= 2 and not l.startswith('#'):
                    info['mat'][ps[0]] = ' '.join(ps[1:])
    return info


def fit(clo, V):
    """Dónde va cada vértice de la prenda sobre el cuerpo morfado (igual que proxy.py de MakeHuman)."""
    r, w = clo['refs'], clo['w']
    P = V[r[:, 0]] * w[:, :1] + V[r[:, 1]] * w[:, 1:2] + V[r[:, 2]] * w[:, 2:3]
    s = np.ones(3)
    for ax, (a, b, den) in clo['scale'].items():
        s[ax] = abs(V[a, ax] - V[b, ax]) / den
    return P + clo['off'] * s


# ---------------------------------------------------------------- esqueleto
# huesos nuestros (nombres de Mixamo) y de qué huesos del esqueleto completo de MakeHuman salen
SKEL = [
    ('Hips', None, ['root', 'pelvis.L', 'pelvis.R', 'spine05']),
    ('Spine', 'Hips', ['spine04', 'spine03']),
    ('Spine2', 'Spine', ['spine02', 'spine01', 'breast.L', 'breast.R']),
    ('Neck', 'Spine2', ['neck01', 'neck02', 'neck03']),
    ('Head', 'Neck', ['head']),
    ('LeftShoulder', 'Spine2', ['clavicle.L', 'shoulder01.L']),
    ('LeftArm', 'LeftShoulder', ['upperarm01.L', 'upperarm02.L']),
    ('LeftForeArm', 'LeftArm', ['lowerarm01.L', 'lowerarm02.L']),
    ('LeftHand', 'LeftForeArm', ['wrist.L']),
    ('RightShoulder', 'Spine2', ['clavicle.R', 'shoulder01.R']),
    ('RightArm', 'RightShoulder', ['upperarm01.R', 'upperarm02.R']),
    ('RightForeArm', 'RightArm', ['lowerarm01.R', 'lowerarm02.R']),
    ('RightHand', 'RightForeArm', ['wrist.R']),
    ('LeftUpLeg', 'Hips', ['upperleg01.L', 'upperleg02.L']),
    ('LeftLeg', 'LeftUpLeg', ['lowerleg01.L', 'lowerleg02.L']),
    ('LeftFoot', 'LeftLeg', ['foot.L']),
    ('RightUpLeg', 'Hips', ['upperleg01.R', 'upperleg02.R']),
    ('RightLeg', 'RightUpLeg', ['lowerleg01.R', 'lowerleg02.R']),
    ('RightFoot', 'RightLeg', ['foot.R']),
]
NB = len(SKEL)
_skel = None


def skeleton_src():
    global _skel
    if _skel is None:
        s = json.load(open(C / 'rigs/default.mhskel'))
        w = json.load(open(C / 'rigs/default_weights.mhw'))['weights']
        bones = s['bones']
        # cada hueso del esqueleto completo va al nuestro que lo contiene (los hijos sin nombrar heredan)
        owner = {}
        for i, (_, _, src) in enumerate(SKEL):
            for b in src:
                owner[b] = i

        def own(b):
            while b not in owner:
                b = bones[b]['parent']
            return owner[b]

        W = np.zeros((len(base_mesh()), NB), np.float32)
        for b, lst in w.items():
            if not lst:
                continue
            o = own(b)
            a = np.array(lst)
            np.add.at(W[:, o], a[:, 0].astype(int), a[:, 1])
        _skel = (s, W)
    return _skel


def skeleton(V):
    s, W = skeleton_src()
    joint = lambda j: V[s['joints'][j]].mean(0)
    bones = []
    for name, parent, src in SKEL:
        bones.append({'name': name, 'parent': parent, 'pos': joint(s['bones'][src[0]]['head'])})
    # la punta de la cabeza (sin peso): le da dirección al hueso de la cabeza en rig.js
    head = joint(s['bones']['head']['head'])
    top = V[:13380, 1].max()
    bones.append({'name': 'HeadTop_End', 'parent': 'Head', 'pos': np.array([head[0], top, head[2]])})
    return bones, W


# ---------------------------------------------------------------- atlas
A = 2048  # el atlas se arma grande y pack.mjs lo achica
# zonas del atlas (x, y, ancho, alto en una grilla de 1/8): piel entera, cabeza ampliada, ropa, pelo…
SLOTS = {
    'skin': (0, 0, 4, 4),
    'head': (4, 0, 2, 4),
    'hair': (6, 0, 2, 4),
    'clothes': (0, 4, 4, 4),
    'shoes': (4, 4, 2, 2),
    'extra': (6, 4, 2, 2),
    'eyes': (4, 6, 1, 1),
    'brows': (5, 6, 1, 0.5),
    'lashes': (5, 6.5, 1, 0.5),
    'extra2': (6, 6, 2, 2),
}
# la cabeza dentro de la textura de piel de MakeHuman (fracciones de la imagen, y hacia abajo)
HEAD = (0.632, 0.14, 1.0, 0.88)


def slot_px(name):
    x, y, w, h = SLOTS[name]
    u = A // 8
    return int(x * u), int(y * u), int(w * u), int(h * u)


def paste(atlas, img, name, crop=None):
    x, y, w, h = slot_px(name)
    img = img.convert('RGBA')
    if crop:
        W0, H0 = img.size
        img = img.crop((int(crop[0] * W0), int(crop[1] * H0), int(crop[2] * W0), int(crop[3] * H0)))
    atlas.paste(img.resize((w, h), Image.LANCZOS), (x, y))


def to_atlas(uv, name, crop=None):
    """uv de OBJ (v hacia arriba) → uv del atlas en glTF (v hacia abajo)."""
    x, y, w, h = slot_px(name)
    u, v = uv[:, 0], 1 - uv[:, 1]
    if crop:
        u = (u - crop[0]) / (crop[2] - crop[0])
        v = (v - crop[1]) / (crop[3] - crop[1])
    return np.stack([(x + u * w) / A, (y + v * h) / A], 1)


# ---------------------------------------------------------------- armado


def part_mesh(clo, P, Wb, faces_keep=None):
    """Triangula y separa vértices por (posición, uv). Devuelve posiciones, uv de OBJ, pesos, triángulos."""
    keys = {}
    pos, uvs, wts, tris, src = [], [], [], [], []
    for fi, (f, ft) in enumerate(zip(clo['F'], clo['FT'])):
        if faces_keep is not None and not faces_keep[fi]:
            continue
        ids = []
        for v, t in zip(f, ft):
            k = (v, t)
            if k not in keys:
                keys[k] = len(pos)
                src.append(v)
                pos.append(P[v])
                uvs.append(clo['T'][t] if t >= 0 else (0, 0))
                wts.append(Wb[v])
            ids.append(keys[k])
        for i in range(1, len(ids) - 1):
            tris.append((ids[0], ids[i], ids[i + 1]))
    part_mesh.src = np.array(src, int)  # de qué vértice de la prenda sale cada uno
    return np.array(pos), np.array(uvs), np.array(wts), np.array(tris, int)


def clo_weights(clo, W):
    r, w = clo['refs'], clo['w']
    out = W[r[:, 0]] * w[:, :1] + W[r[:, 1]] * w[:, 1:2] + W[r[:, 2]] * w[:, 2:3]
    return np.clip(out, 0, None)


def load_img(clo, key='diffuseTexture', fallback=None):
    tex = clo['mat'].get(key)
    if tex:
        p = clo['dir'] / tex
        if p.exists():
            return Image.open(p)
    if fallback:
        return Image.open(fallback)
    raise SystemExit('sin textura para ' + clo.get('name', '?'))


def neutral(img, hair):
    """Pelo y cejas en gris neutro (luminancia lineal media 0,18): el juego les da el color. El fondo
    transparente toma el gris medio (sin halos) y el alfa se endurece un poco para que el pelo no se
    vuelva transparente de lejos (el mipmap promedia el alfa)."""
    a = np.asarray(img.convert('RGBA'), np.float32) / 255
    lin = a[..., :3] ** 2.2
    lum = lin @ [0.2126, 0.7152, 0.0722]
    al = a[..., 3]
    solid = al > 0.5
    lum = lum * (0.18 / max(lum[solid].mean() if solid.any() else 0.18, 1e-3))
    lum[al < 0.05] = 0.18
    g = np.clip(lum, 0, 1) ** (1 / 2.2)
    if hair:
        al = np.clip((al - 0.12) / 0.55, 0, 1)
    out = np.dstack([g, g, g, al])
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def build(name, spec):
    print('==', name)
    V = morph(spec)
    bones, W = skeleton(V)
    ground = V[:13380, 1].min()
    meters = lambda P: (P - [0, ground, 0]) * 0.1
    atlas = Image.new('RGBA', (A, A), (0, 0, 0, 255))
    parts = []

    # ---- ropa primero: dice qué parte del cuerpo se tapa
    deleted = np.zeros(len(V), bool)
    clothes = []
    for c in spec['clothes']:
        clo = read_clo(C / 'clothes' / c / f'{c}.mhclo')
        deleted[clo['delete']] = True
        clothes.append(clo)

    # ---- cuerpo (proxy)
    sex = 'female' if spec['gender'] < 0.5 else 'male'
    px = read_clo(C / 'proxymeshes' / spec.get('proxy', 'female1605' if sex == 'female' else 'male1591') / ('%s.proxy' % spec.get('proxy', 'female1605' if sex == 'female' else 'male1591')))
    P = fit(px, V)
    # un vértice del cuerpo se esconde si el de la malla base que más pesa quedó tapado; una cara se
    # esconde si quedó tapada entera (con "alguno tapado" se abrían agujeros en el cuello y los puños)
    main = px['refs'][np.arange(len(px['refs'])), np.argmax(px['w'], 1)]
    hid = deleted[main]
    keep = np.array([not all(hid[v] for v in f) for f in px['F']])
    pos, uv, wts, tris = part_mesh(px, P, clo_weights(px, W), keep)
    # la cara va a su zona ampliada del atlas; el resto del cuerpo a la de piel
    inhead = (uv[:, 0] >= HEAD[0]) & (1 - uv[:, 1] >= HEAD[1]) & (1 - uv[:, 1] <= HEAD[3])
    tri_head = inhead[tris].all(1)
    vhead = np.zeros(len(pos), bool)
    vhead[tris[tri_head].ravel()] = True
    auv = np.where(vhead[:, None], to_atlas(uv, 'head', HEAD), to_atlas(uv, 'skin'))
    # los vértices compartidos entre caras de la cabeza y del cuello (no debería haber: islas aparte)
    parts.append(('body', 'body', pos, auv, wts, tris, 1))
    sk = spec['skin'] if spec['skin'][-1].isdigit() else spec['skin'] + '_diffuse'
    skin = Image.open(C / 'skins/textures' / (sk + '.png')).convert('RGB')
    # sombra de las cavidades (ojos, nariz, boca, orejas, dedos) horneada en la piel
    cv = cavity(C, V, skin.size[0], spec.get('cavity', 1.3))
    lin = (np.asarray(skin, np.float32) / 255) ** 2.2 * cv[..., None]
    if spec.get('photo'):
        # una cara de verdad (Gaspi): ojos y mentón medidos en el esqueleto (hueso del ojo y punta de la mandíbula)
        sk = skeleton_src()[0]
        joint = lambda j: V[sk['joints'][j]].mean(0)
        eye_y = joint(sk['bones']['eye.L']['head'])[1]
        chin_y = joint(sk['bones']['jaw']['tail'])[1]
        ph = dict(spec['photo'], file=str(HERE.parents[2] / spec['photo']['file']))  # desde la raíz del repo
        lin = photo_bake(C, V, np.clip(lin, 0, 1) ** (1 / 2.2), ph, eye_y, chin_y, HEAD) ** 2.2
    skin = Image.fromarray((np.clip(lin, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))
    paste(atlas, skin, 'skin')
    paste(atlas, skin, 'head', HEAD)

    # ---- ropa: todas las prendas comparten la zona 'clothes' salvo los zapatos
    big = [c for c in clothes if not c['name'].startswith('shoes')]
    shoes = [c for c in clothes if c['name'].startswith('shoes')]
    if len(big) > 1:
        raise SystemExit('por ahora una sola prenda grande por personaje')
    for clo, slot in [(c, 'clothes') for c in big] + [(c, 'shoes') for c in shoes]:
        P = fit(clo, V)
        pos, uv, wts, tris = part_mesh(clo, P, clo_weights(clo, W))
        parts.append((slot, clo['name'], pos, to_atlas(uv, slot), wts, tris, 2 if slot == 'clothes' else 0))
        paint = spec.get('paint', {}).get(clo['name'], {})
        names = [b[0] for b in SKEL]
        if paint:
            img, top = repaint(clo, meters(P), clo_weights(clo, W), names, paint)
        else:
            img = load_img(clo)
            if slot == 'clothes':
                isl, up = classify(clo, clo_weights(clo, W), names)
                top = up[isl]
        if slot == 'clothes':
            # en el juego cambia de color la parte de arriba (salvo camisetas y uniformes: 'fixed'); la de
            # abajo queda como es (un jean violeta no existe), salvo que se pida 'tint'
            kv = np.full(len(P), 4)
            for which, sel, default in (('top', top, spec.get('tint', True)), ('bottom', ~top, False)):
                sp = paint.get(which, {})
                if sp.get('tint', default and not sp.get('fixed')):
                    for fi in np.nonzero(sel)[0]:
                        kv[clo['F'][fi]] = 2
            parts[-1] = parts[-1][:6] + (kv[part_mesh.src],)
        paste(atlas, pad(img, clo), slot)

    # ---- pelo, cejas, pestañas, ojos
    def acc(path, slot, part, tex=None):
        clo = read_clo(path)
        P = fit(clo, V)
        pos, uv, wts, tris = part_mesh(clo, P, clo_weights(clo, W))
        parts.append((slot, clo['name'], pos, to_atlas(uv, slot), wts, tris, part))
        img = Image.open(tex) if tex else load_img(clo)
        paste(atlas, neutral(img, slot == 'hair') if part == 3 else img, slot)

    if spec.get('hair'):
        acc(C / 'hair' / spec['hair'] / (spec['hair'] + '.mhclo'), 'hair', 3)
    if spec.get('brows', 'eyebrow001'):  # con foto de la cara, las cejas son las de la foto
        acc(C / 'eyebrows' / spec.get('brows', 'eyebrow001') / (spec.get('brows', 'eyebrow001') + '.mhclo'), 'brows', 3)
    acc(C / 'eyelashes' / spec.get('lashes', 'eyelashes01') / (spec.get('lashes', 'eyelashes01') + '.mhclo'), 'lashes', 0)
    acc(C / 'eyes/low-poly/low-poly.mhclo', 'eyes', 0, C / 'eyes/materials/brown_eye.png')

    # ---- a metros, con los pies en el piso
    ymin = min(p[2][:, 1].min() for p in parts)
    k = 0.1
    out = {'name': name, 'bones': [], 'parts': [], 'extras': spec.get('extras', {})}
    for b in bones:
        q = (b['pos'] - [0, ymin, 0]) * k
        out['bones'].append({'name': b['name'], 'parent': b['parent'], 'pos': [round(float(x), 5) for x in q]})
    for role, pname, pos, auv, wts, tris, kind in parts:
        q = (pos - [0, ymin, 0]) * k
        # los 4 huesos que más pesan, normalizados
        order = np.argsort(-wts, 1)[:, :4]
        ww = np.take_along_axis(wts, order, 1)
        ss = ww.sum(1, keepdims=True)
        bad = ss[:, 0] <= 1e-6
        if bad.any():
            print('  %s: %d vértices sin peso (van a la cabeza o la cadera)' % (pname, bad.sum()))
            order[bad] = [0, 1, 2, 3]
            ww[bad] = [1, 0, 0, 0]
            ss[bad] = 1
        ww = ww / ss
        out['parts'].append({
            'role': role, 'name': pname, 'kind': np.broadcast_to(kind, len(pos)).tolist(),
            'pos': q.round(5).ravel().tolist(), 'uv': auv.round(6).ravel().tolist(),
            'joints': order.ravel().tolist(), 'weights': ww.round(5).ravel().tolist(),
            'index': tris.ravel().tolist(),
        })
        print('  %-22s %5d vért %5d tri' % (pname, len(pos), len(tris)))
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(OUT / f'{name}.json', 'w'))
    atlas.save(OUT / f'{name}.png')


if __name__ == '__main__':
    names = sys.argv[1:] or list(CAST)
    for n in names:
        build(n, CAST[n])
