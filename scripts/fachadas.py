#!/usr/bin/env python3
"""Texturas de foto para las paredes (Poly Haven, CC0), livianas para el celu.

Baja de la API pública de Poly Haven el color (Diffuse) y la altura (Displacement) de cada material
y los junta en un solo WebP con transparencia: RGB = color, A = altura entre 0,5 y 1 (el juego saca el
relieve de ahí, sin mapa de normales aparte). Escribe public/textures/fachada.json con el tamaño real de cada
foto y su color promedio (el juego tiñe la foto con el color de la fachada dibujada).

  python3 scripts/fachadas.py

Necesita red hacia api.polyhaven.com y dl.polyhaven.org, y Pillow con WebP.
"""
import io
import json
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

# nombre en el juego: (asset de Poly Haven, lado del WebP en píxeles)
WANT = {
    # ladrillo a la vista común, anaranjado, hiladas de ~8 cm
    'visto': ('red_bricks_04', 1024),
    # ladrillo hueco sin revocar: el de ladrillos grandes, anaranjado (el juego lo agranda)
    'hueco': ('large_red_bricks', 512),
    # revoque gastado con manchas de humedad (se usa el grano y las manchas, no el color)
    'revoque': ('plaster_grey_04', 512),
}
UA = {'User-Agent': 'gta-conurba-fachadas'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    meta = {}
    for name, (asset, size) in WANT.items():
        info = json.loads(get(f'https://api.polyhaven.com/info/{asset}'))
        files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
        color = Image.open(io.BytesIO(get(files['Diffuse']['1k']['jpg']['url']))).convert('RGB')
        height = Image.open(io.BytesIO(get(files['Displacement']['1k']['png']['url']))).convert('L')
        if color.size[0] != size:
            color = color.resize((size, size), Image.LANCZOS)
            height = height.resize((size, size), Image.LANCZOS)
        # la altura apenas suavizada: sin escalones de 8 bits en el relieve. Va de 128 a 255: con la
        # transparencia muy baja algunos navegadores (Safari) pierden precisión en el color.
        height = height.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: 128 + v // 2)
        out = color.copy()
        out.putalpha(height)
        path = f'public/textures/fachada_{name}.webp'
        out.save(path, 'WEBP', quality=84, alpha_quality=90, method=6, exact=True)
        # promedio en lineal (como lo ve el shader)
        c = np.asarray(color, dtype=np.float64) / 255
        lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
        avg = [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)]
        meta[name] = {
            'file': f'fachada_{name}.webp',
            'asset': asset,
            'name': info['name'],
            'authors': list(info.get('authors', {}).keys()),
            # tamaño real que cubre la foto, en metros
            'meters': round(info['dimensions'][0] / 1000, 3),
            'avg': avg,
        }
        print(f'{path}  <- {asset} ({info["name"]}), {meta[name]["meters"]} m, promedio {avg}')
    with open('public/textures/fachada.json', 'w') as f:
        json.dump(meta, f, indent=1)
    print('public/textures/fachada.json')


if __name__ == '__main__':
    main()
