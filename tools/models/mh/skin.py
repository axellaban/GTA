# Sombreado de la piel horneado en la textura: las cavidades (cuencas de los ojos, costados de la nariz,
# comisuras, orejas, entre los dedos) se oscurecen y lo saliente se aclara un poco. Se calcula sobre la
# malla base morfada (13 mil vértices, mucho más fina que el proxy del juego) comparando cada vértice con
# su vecindario suavizado a varias escalas, y se pinta en el espacio uv de la piel de MakeHuman.
import numpy as np

from paint import dilate, raster_tris

_geo = None


def body_faces(C):
    """Caras del grupo 'body' de base.obj (cuadriláteros) con sus uv."""
    global _geo
    if _geo is None:
        npz = C / 'base_body.npz'
        if npz.exists():
            z = np.load(npz)
            _geo = (z['F'], z['FT'], z['T'])
        else:
            F, FT, T, group = [], [], [], None
            for line in open(C / '3dobjs/base.obj'):
                if line.startswith('vt '):
                    T.append([float(x) for x in line.split()[1:3]])
                elif line.startswith('g '):
                    group = line.split()[1]
                elif line.startswith('f ') and group == 'body':
                    idx = [p.split('/') for p in line.split()[1:]]
                    F.append([int(p[0]) - 1 for p in idx])
                    FT.append([int(p[1]) - 1 for p in idx])
            _geo = (np.array(F), np.array(FT), np.array(T))
            np.savez(npz, F=_geo[0], FT=_geo[1], T=_geo[2])
    return _geo


def vertex_normals(V, F):
    a, b, c, d = (V[F[:, k]] for k in range(4))
    fn = np.cross(c - a, d - b)
    N = np.zeros_like(V)
    for k in range(4):
        np.add.at(N, F[:, k], fn)
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


def head_maps(C, V, size, head_uv):
    """Posición y normal de la malla base (dm) en cada texel de la zona de la cabeza de la piel."""
    F, FT, T = body_faces(C)
    N = vertex_normals(V, F)
    uv = T[FT]
    x0, y0, x1, y1 = head_uv
    sel = ((uv[..., 0] >= x0) & (1 - uv[..., 1] >= y0) & (1 - uv[..., 1] <= y1)).all(1)
    uvpx = uv[sel] * [size, size]
    uvpx[..., 1] = size - uvpx[..., 1]
    vals = np.concatenate([V[F[sel]], N[F[sel]]], axis=2).astype(np.float32)
    tris = np.concatenate([uvpx[:, [0, 1, 2]], uvpx[:, [0, 2, 3]]])
    tv = np.concatenate([vals[:, [0, 1, 2]], vals[:, [0, 2, 3]]])
    img, m = raster_tris(tris, tv, size)
    nrm = img[..., 3:]
    nrm = nrm / (np.linalg.norm(nrm, axis=2, keepdims=True) + 1e-9)
    return img[..., :3], nrm, m


def beard(C, V, skin, spec, eye_y, chin_y, head_uv):
    """Barba, bigote o barba de días pintados en la piel (linyera, panchero, armero). La zona se define
    en la cara: alto relativo r = 0 en la punta del mentón y 1 a la altura de los ojos."""
    from paint import hexrgb, noise3
    size = skin.shape[0]
    pos, nrm, m = head_maps(C, V, size, head_uv)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    r = (y - chin_y) / (eye_y - chin_y)
    ax = np.abs(x)
    sm = lambda e0, e1, v: np.clip((v - e0) / (e1 - e0), 0, 1)
    kind = spec.get('kind', 'full')
    front = sm(-0.35, 0.1, nrm[..., 2])  # no la nuca
    lips = sm(0.3, 0.2, ax) * sm(0.21, 0.25, r) * sm(0.37, 0.33, r) * sm(0.2, 0.6, nrm[..., 2])
    if kind == 'mustache':
        a = sm(0.34, 0.24, ax) * sm(0.35, 0.39, r) * sm(0.5, 0.45, r) * sm(0.3, 0.6, nrm[..., 2])
        dens = 0.95
    else:
        # mejillas bajas, mandíbula, mentón y bigote; un poco por debajo del mentón
        a = sm(0.55, 0.47, r) * sm(-0.28, -0.12, r) * sm(0.72, 0.6, ax) * front * (1 - lips)
        # la línea de la mejilla sube hacia las patillas
        a *= sm(0.0, 0.08, 0.55 + 0.25 * sm(0.3, 0.65, ax) - r + 0.08)
        dens = 0.9 if kind == 'full' else 0.42
    # pelo: un ruido fino (de lejos se ve como sombra) y el borde más ralo
    n = noise3(pos * 42, 11) * 0.6 + noise3(pos * 95, 12) * 0.4
    a = np.clip(a * dens * (0.55 + 0.75 * n), 0, 1) * m
    col = hexrgb(spec.get('color', '#2b2018')) ** 2.2
    lin = skin ** 2.2
    out = lin * (1 - a[..., None]) + col * (0.75 + 0.5 * n[..., None]) * a[..., None]
    return np.clip(out, 0, 1) ** (1 / 2.2)


def socks(C, V, skin, color, ground, y0, y1):
    """Medias de fútbol pintadas en la piel de las piernas, entre y0 e y1 (m desde el piso): tela con un
    tejido fino, un poco más oscura en el borde de arriba (el elástico) y sin cortes en las costuras."""
    from paint import hexrgb, noise3, dilate
    size = skin.shape[0]
    pos, nrm, m = head_maps(C, V, size, (0, 0, 1, 1))
    y = (pos[..., 1] - ground) * 0.1
    a = np.clip((y - y0) / 0.01, 0, 1) * np.clip((y1 - y) / 0.008, 0, 1) * m
    # por las costuras de la uv: el color se estira unos píxeles afuera de las caras
    a, _ = dilate(a[..., None].astype(np.float32), m > 0, 4)
    a = a[..., 0]
    n = noise3(pos * [60, 160, 60], 21)
    band = 1 - 0.18 * np.clip((y - (y1 - 0.035)) / 0.01, 0, 1)
    col = hexrgb(color) ** 2.2 * (0.82 + 0.16 * n[..., None]) * band[..., None]
    lin = skin ** 2.2
    out = lin * (1 - a[..., None]) + col * a[..., None]
    return np.clip(out, 0, 1) ** (1 / 2.2)


def photo(C, V, skin, spec, eye_y, chin_y, head_uv):
    """Pega una foto de frente (la cara de Gaspi) en la textura de la piel: cada texel de la cabeza se
    proyecta de frente sobre la foto, alineando ojos y mentón; pesa más donde la cara mira para adelante
    y se funde con el alfa de la foto. El resto de la piel toma el tono de la foto."""
    from PIL import Image
    size = skin.shape[0]
    pos, nrm, m = head_maps(C, V, size, head_uv)
    # de la malla (dm) a la caja de la foto (m): ojos y mentón donde los espera
    k = (spec['eye_y'] - spec['chin_y']) / ((eye_y - chin_y) * 0.1)
    px = pos[..., 0] * 0.1 * k
    py = spec['eye_y'] + (pos[..., 1] - eye_y) * 0.1 * k
    ph = np.asarray(Image.open(spec['file']).convert('RGBA'), np.float32) / 255
    H, W = ph.shape[:2]
    fx = (px - spec['x0']) / (spec['x1'] - spec['x0']) * W - 0.5
    fy = (spec['y1'] - py) / (spec['y1'] - spec['y0']) * H - 0.5
    ix = np.clip(np.floor(fx).astype(int), 0, W - 2)
    iy = np.clip(np.floor(fy).astype(int), 0, H - 2)
    ax = np.clip(fx - ix, 0, 1)[..., None]
    ay = np.clip(fy - iy, 0, 1)[..., None]
    smp = ph[iy, ix] * (1 - ax) * (1 - ay) + ph[iy, ix + 1] * ax * (1 - ay) + ph[iy + 1, ix] * (1 - ax) * ay + ph[iy + 1, ix + 1] * ax * ay
    inside = (fx >= 0) & (fx < W - 1) & (fy >= 0) & (fy < H - 1)
    front = np.clip((nrm[..., 2] - 0.3) / 0.4, 0, 1)
    # nada por debajo del mentón (ahí la foto tiene el saco y la sombra del cuello)
    below = np.clip((py - (spec['chin_y'] - 0.004)) / 0.012, 0, 1)
    w = smp[..., 3] * front * m * inside * below
    w = w * w * (3 - 2 * w)
    lin = skin ** 2.2
    pc = np.clip(smp[..., :3], 0, 1)
    g = pc.mean(2, keepdims=True)
    pc = g + (pc - g) * spec.get('sat', 1.0)
    plin = np.clip(pc * spec.get('gain', 1.0), 0, 1) ** 2.2
    # tono: la piel entera se lleva al de la foto (medido en el centro de la cara)
    core = w > 0.85
    if core.sum() > 50:
        ratio = plin[core].mean(0) / np.maximum(lin[core].mean(0), 1e-4)
        lin = lin * np.clip(ratio, 0.6, 1.6)
    out = lin * (1 - w[..., None]) + plin * w[..., None]
    return np.clip(out, 0, 1) ** (1 / 2.2)


def cavity(C, V, size=2048, strength=1.0):
    """Multiplicador (size × size) para la textura de piel: < 1 en los huecos, un poco > 1 en lo saliente."""
    F, FT, T = body_faces(C)
    nv = len(V)
    N = vertex_normals(V, F)
    # vecinos (aristas de los cuadriláteros)
    E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 3]], F[:, [3, 0]]])
    E = np.concatenate([E, E[:, ::-1]])
    deg = np.bincount(E[:, 0], minlength=nv).astype(np.float64)
    used = deg > 0
    el = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    mel = np.bincount(E[:, 0], weights=el, minlength=nv) / np.maximum(deg, 1)

    def smooth(P, n):
        for _ in range(n):
            acc = np.zeros_like(P)
            np.add.at(acc, E[:, 0], P[E[:, 1]])
            P = np.where(used[:, None], acc / np.maximum(deg, 1)[:, None], P)
        return P

    occ = np.zeros(nv)
    P = V.copy()
    done = 0
    # escalas (pasadas de suavizado acumuladas): arrugas finas, rasgos (nariz, labios), cuencas de los ojos
    for steps, w in ((2, 0.9), (8, 0.7), (30, 0.55)):
        P = smooth(P, steps - done)
        done = steps
        dv = ((P - V) * N).sum(1) / np.maximum(mel, 1e-6)
        occ += w * dv / np.sqrt(steps)
    # sin la curvatura de conjunto (la cabeza entera es convexa): solo lo que hunde respecto de su zona
    occ = occ - smooth(occ[:, None], 60)[:, 0]
    shade = 1 - np.clip(occ * 0.9 * strength, -0.1, 0.6)
    # a la textura
    uvpx = T[FT] * [size, size]
    uvpx[..., 1] = size - uvpx[..., 1]
    vals = shade[F][..., None].astype(np.float32)
    tris = np.concatenate([uvpx[:, [0, 1, 2]], uvpx[:, [0, 2, 3]]])
    tv = np.concatenate([vals[:, [0, 1, 2]], vals[:, [0, 2, 3]]])
    img, m = raster_tris(tris, tv, size)
    img, m2 = dilate(img, m, 8)
    img[~m2] = 1
    return img[..., 0]


def scalp(C, V, hw, hair, P, eye_y, chin_y, size):
    """Dónde el pelo tapa la cabeza (0..1 en el espacio de la piel): ahí el juego pinta la piel del color
    del pelo, como el pelo corto pintado de San Andreas (así no se ve el corte entre las mechas y la
    frente, y de lejos, con menos mechas, la cabeza sigue teniendo pelo). Para cada vértice de la cabeza
    se buscan puntos opacos del pelo (según el alfa de su textura) delante de la piel, a lo largo de la
    normal: hasta 3 cm afuera y a menos de 1 cm de costado."""
    from PIL import Image
    F, FT, T = body_faces(C)
    nv = 13380
    Vb = V[:nv]
    N = vertex_normals(V, F)[:nv]
    # puntos del pelo: varios por triángulo, solo los opacos
    img = np.asarray(hair['img'].convert('RGBA'), np.float32)[..., 3] / 255
    H_, W_ = img.shape
    tri, tuv = [], []
    for f, ft in zip(hair['F'], hair['FT']):
        for i in range(1, len(f) - 1):
            tri.append((f[0], f[i], f[i + 1]))
            tuv.append((ft[0], ft[i], ft[i + 1]))
    tri, tuv = np.array(tri), np.array(tuv)
    HT = np.asarray(hair['T'], float)
    bary = np.array([[1, 1, 1], [4, 1, 1], [1, 4, 1], [1, 1, 4], [2, 2, 0.5], [0.5, 2, 2], [2, 0.5, 2]], float)
    bary /= bary.sum(1, keepdims=True)
    Q = np.einsum('kj,tjc->tkc', bary, P[tri]).reshape(-1, 3)
    U = np.einsum('kj,tjc->tkc', bary, HT[tuv]).reshape(-1, 2)
    a = img[np.clip(((1 - U[:, 1]) * H_).astype(int), 0, H_ - 1), np.clip((U[:, 0] * W_).astype(int), 0, W_ - 1)]
    Q = Q[a > 0.5]
    # vértices de la cabeza (sin la cara de frente)
    head = hw[:nv] > 0.5  # peso de la cabeza y el cuello
    face = (N[:, 2] > 0.3) & (Vb[:, 1] < eye_y + 0.3)
    head &= ~face & (Vb[:, 1] > chin_y)
    idx = np.nonzero(head)[0]
    m = np.zeros(nv)
    for i0 in range(0, len(idx), 128):
        ii = idx[i0:i0 + 128]
        d = Q[None, :, :] - Vb[ii, None, :]
        along = (d * N[ii, None, :]).sum(2)
        lat = np.linalg.norm(d - along[..., None] * N[ii, None, :], axis=2)
        ok = (along > -0.05) & (along < 0.3)
        cov = np.clip((0.1 - lat) / 0.05, 0, 1) * ok
        m[ii] = cov.max(1) if cov.shape[1] else 0
    # suavizado por las aristas (el borde queda difuso, como el nacimiento del pelo)
    E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 3]], F[:, [3, 0]]])
    E = np.concatenate([E, E[:, ::-1]])
    deg = np.bincount(E[:, 0], minlength=len(V)).astype(float)
    mv = np.zeros(len(V))
    mv[:nv] = m
    for _ in range(2):
        acc = np.zeros(len(V))
        np.add.at(acc, E[:, 0], mv[E[:, 1]])
        mv = np.where(deg > 0, 0.5 * mv + 0.5 * acc / np.maximum(deg, 1), mv)
    mv[:nv][face] = 0
    uvpx = T[FT] * [size, size]
    uvpx[..., 1] = size - uvpx[..., 1]
    vals = np.clip(mv, 0, 1)[F][..., None].astype(np.float32)
    tris = np.concatenate([uvpx[:, [0, 1, 2]], uvpx[:, [0, 2, 3]]])
    tv = np.concatenate([vals[:, [0, 1, 2]], vals[:, [0, 2, 3]]])
    out, mk = raster_tris(tris, tv, size)
    out, mk2 = dilate(out, mk, 8)
    out[~mk2] = 0
    return np.clip(out[..., 0], 0, 1)
