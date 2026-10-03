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


def cavity(C, V, size=2048, strength=1.0):
    """Multiplicador (size × size) para la textura de piel: < 1 en los huecos, un poco > 1 en lo saliente."""
    F, FT, T = body_faces(C)
    nv = len(V)
    # normales por vértice
    a, b, c, d = (V[F[:, k]] for k in range(4))
    fn = np.cross(c - a, d - b)
    N = np.zeros_like(V)
    for k in range(4):
        np.add.at(N, F[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
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
