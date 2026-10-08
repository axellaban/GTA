# El agua de la inundación sale de la simulación de océano de Blender (el modificador Ocean: espectro de
# Phillips/JONSWAP con FFT, el método de Tessendorf que se usa en el cine), sin abrir la interfaz:
#   pip install bpy pillow numpy        (probado con bpy 5.2)
#   python3 tools/blender/agua.py
# Sale:
#   public/textures/agua_normal.webp     16 cuadros de 256 x 256 (atlas de 4 x 4) de un pedazo de agua de
#                                        6 x 6 m que se repite: rojo y verde, la pendiente de la superficie
#                                        (0,5 = plano); azul, la espuma que calcula Blender. Los cuadros
#                                        hacen un ciclo cerrado (el último empalma con el primero).
#   public/textures/agua_causticas.webp  las cáusticas de esas mismas ondas (gris, mismo atlas): la luz del
#                                        sol refractada por la superficie y juntada en el fondo a 1,2 m. Se
#                                        calcula como en "WebGL Water" de Evan Wallace (MIT): cada rayo de
#                                        luz se dobla con la ley de Snell y lo que llega al fondo se acumula;
#                                        donde los rayos se juntan, brilla.
# src/agua.js usa las normales y la espuma en la superficie, y las cáusticas en todo lo que queda abajo
# del agua (src/atmosphere.js) y en los rayos de luz bajo el agua (src/post.js).
import os

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_N = os.path.join(ROOT, 'public', 'textures', 'agua_normal.webp')
OUT_C = os.path.join(ROOT, 'public', 'textures', 'agua_causticas.webp')

TILE = 6.0  # metros que abarca el pedazo (se repite)
FRAMES = 16  # cuadros del ciclo
SIZE = 256  # px por cuadro
DT = 0.09  # segundos de simulación entre cuadros
DEPTH = 1.2  # profundidad del fondo para las cáusticas (m)
CWL = 0.22  # largo de onda mínimo para las cáusticas (m)
CSLOPE = 0.24  # pendiente media de las olas que hacen las cáusticas
SLOPE = 0.6  # pendiente que se guarda como 1 (rojo/verde = 0,5 ± pendiente/SLOPE/2)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add(size=2)
ob = bpy.context.active_object
oc = ob.modifiers.new('ocean', 'OCEAN')
oc.geometry_mode = 'GENERATE'
oc.resolution = oc.viewport_resolution = 16  # 256 x 256
oc.spatial_size = int(TILE)
oc.spectrum = 'PHILLIPS'
oc.wind_velocity = 4.5  # olas cortas de agua encerrada (no de mar abierto)
oc.wave_scale = 0.12
oc.wave_scale_min = 0.0
oc.wave_alignment = 0.35
oc.wave_direction = 0.6
oc.damping = 0.5
oc.choppiness = 0.0  # altura pura: la grilla queda regular
oc.depth = 2.0
oc.random_seed = 7
oc.use_foam = True
oc.foam_layer_name = 'foam'
oc.foam_coverage = 0.25


def sample(t):
    # alturas y espuma de la simulación en el instante t (grilla de SIZE x SIZE, periódica)
    oc.time = t
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    foam_attr = me.attributes['foam']
    fv = np.zeros(n)
    if foam_attr.domain == 'POINT':
        tmp = np.empty(len(foam_attr.data) * 4 if foam_attr.data_type in ('FLOAT_COLOR', 'BYTE_COLOR') else len(foam_attr.data))
        if foam_attr.data_type in ('FLOAT_COLOR', 'BYTE_COLOR'):
            foam_attr.data.foreach_get('color', tmp)
            fv = tmp.reshape(-1, 4)[:, 0]
        else:
            foam_attr.data.foreach_get('value', tmp)
            fv = tmp
    else:
        # por esquina: se promedia en cada vértice
        cv = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get('vertex_index', cv)
        if foam_attr.data_type in ('FLOAT_COLOR', 'BYTE_COLOR'):
            tmp = np.empty(len(foam_attr.data) * 4)
            foam_attr.data.foreach_get('color', tmp)
            val = tmp.reshape(-1, 4)[:, 0]
        else:
            val = np.empty(len(foam_attr.data))
            foam_attr.data.foreach_get('value', val)
        acc = np.zeros(n)
        cnt = np.zeros(n)
        np.add.at(acc, cv, val)
        np.add.at(cnt, cv, 1)
        fv = acc / np.maximum(cnt, 1)
    ev.to_mesh_clear()
    # ordenar por (y, x) y sacar la última fila y columna (repiten la primera)
    m = int(round(np.sqrt(n)))
    order = np.lexsort((co[:, 0], co[:, 1]))
    H = co[order, 2].reshape(m, m)[:-1, :-1]
    F = fv[order].reshape(m, m)[:-1, :-1]
    return H, F


def upsample(H, k):
    # interpolación exacta de una señal periódica: se rellena el espectro con ceros
    n = H.shape[0]
    S = np.fft.fftshift(np.fft.fft2(H))
    p = (n * k - n) // 2
    S = np.pad(S, ((p, p), (p, p)))
    return np.real(np.fft.ifft2(np.fft.ifftshift(S))) * k * k


def slopes(H, cell):
    sx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / (2 * cell)
    sy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / (2 * cell)
    return sx, sy


def lowpass(H, wl):
    # deja las olas de más de `wl` metros (las chiquitas no juntan la luz: la desparraman)
    n = H.shape[0]
    k = np.fft.fftfreq(n, d=TILE / n)
    kx, ky = np.meshgrid(k, k)
    S = np.fft.fft2(H) * np.exp(-((kx * kx + ky * ky) * (wl * wl)) * 2.0)
    return np.real(np.fft.ifft2(S))


def caustics(H):
    # luz del sol casi vertical que entra al agua, se dobla y llega al fondo
    K = 2
    Hl = lowpass(H, CWL)
    # se escala para que las olas enfoquen la luz cerca del fondo (líneas finas y brillantes)
    sx0, sy0 = slopes(Hl, TILE / H.shape[0])
    Hl *= CSLOPE / max(1e-6, np.sqrt((sx0 ** 2 + sy0 ** 2).mean()))
    Hu = upsample(Hl, K)
    n = Hu.shape[0]
    cell = TILE / n
    sx, sy = slopes(Hu, cell)
    N = np.stack([-sx, -sy, np.ones_like(sx)], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    L = np.array([0.12, 0.08, -1.0])
    L /= np.linalg.norm(L)
    eta = 1 / 1.333
    cosi = -(N @ L)
    k = 1 - eta * eta * (1 - cosi * cosi)
    T = eta * L[None, None, :] + (eta * cosi - np.sqrt(np.maximum(k, 0)))[..., None] * N
    # dónde pega cada rayo en el fondo (en celdas), con la vuelta del borde (el pedazo se repite)
    j, i = np.mgrid[0:n, 0:n].astype(np.float64)
    d = (DEPTH + Hu) / np.maximum(-T[..., 2], 0.2)
    px = (i + T[..., 0] * d / cell) % n
    py = (j + T[..., 1] * d / cell) % n
    acc = np.zeros((n, n))
    x0 = np.floor(px).astype(int)
    y0 = np.floor(py).astype(int)
    fx = px - x0
    fy = py - y0
    for ox, oy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        np.add.at(acc, ((y0 + oy) % n, (x0 + ox) % n), w)
    # de vuelta a SIZE (promedio de K x K) y un poco de desenfoque (el fondo no es un espejo)
    acc = acc.reshape(SIZE, K, SIZE, K).mean((1, 3))
    for _ in range(1):
        acc = (acc * 4 + np.roll(acc, 1, 0) + np.roll(acc, -1, 0) + np.roll(acc, 1, 1) + np.roll(acc, -1, 1)) / 8
    return acc / acc.mean()


def atlas(frames):
    # 16 cuadros en una grilla de 4 x 4
    rows = [np.concatenate(frames[r * 4:(r + 1) * 4], axis=1) for r in range(4)]
    return np.concatenate(rows, axis=0)


normals = []
caus = []
raw = []
for f in range(FRAMES * 2):
    H, F = sample(2.0 + f * DT)
    raw.append((H, F))
    print(f'cuadro {f + 1}/{FRAMES * 2}: altura {H.min():.3f}..{H.max():.3f} m, espuma máx {F.max():.2f}')
cell = TILE / SIZE
for f in range(FRAMES):
    # ciclo cerrado: cada cuadro mezcla con el que viene FRAMES después (el último empalma con el primero)
    a = f / FRAMES
    Ha, Fa = raw[f]
    Hb, Fb = raw[f + FRAMES]
    sxa, sya = slopes(Ha, cell)
    sxb, syb = slopes(Hb, cell)
    sx = sxa * a + sxb * (1 - a)
    sy = sya * a + syb * (1 - a)
    foam = np.clip((Fa * a + Fb * (1 - a)) * 1.4, 0, 1)
    n_img = np.stack([0.5 + 0.5 * np.clip(sx / SLOPE, -1, 1), 0.5 + 0.5 * np.clip(sy / SLOPE, -1, 1), foam], -1)
    normals.append(n_img)
    c = caustics(Ha) * a + caustics(Hb) * (1 - a)
    caus.append(c)
    print(f'ciclo {f + 1}/{FRAMES}: pendiente máx {np.abs(sx).max():.2f}, cáustica máx {c.max():.1f}')

from PIL import Image  # noqa: E402

os.makedirs(os.path.dirname(OUT_N), exist_ok=True)
nimg = (atlas(normals) * 255 + 0.5).clip(0, 255).astype(np.uint8)
Image.fromarray(nimg, 'RGB').save(OUT_N, 'WEBP', quality=92, method=6)
call = atlas(caus)
# curva: el fondo oscuro con las líneas de luz bien marcadas (1 = luz media)
cimg = (np.clip((call - 0.45) / 2.6, 0, 1) ** 0.75 * 255 + 0.5).astype(np.uint8)
Image.fromarray(cimg, 'L').save(OUT_C, 'WEBP', quality=90, method=6)
print('listo:', OUT_N, os.path.getsize(OUT_N) // 1024, 'KB ·', OUT_C, os.path.getsize(OUT_C) // 1024, 'KB')
