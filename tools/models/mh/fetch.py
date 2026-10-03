# Baja los assets de MakeHuman (CC0: ver LICENSE.ASSETS en github.com/makehumancommunity/makehuman)
# a tools/models/mh/cache/: la malla base, los morfos del cuerpo, el esqueleto con sus pesos y los ojos
# (de GitHub), y los proxies livianos, pieles, cejas, pestañas, pelo y ropa (del servidor de MakeHuman,
# download.tuxfamily.org/makehuman/assets/1.1/base). Se puede cortar y volver a correr: no repite.
#
#   python3 tools/models/mh/fetch.py
import os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
GH = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
TUX = 'https://download.tuxfamily.org/makehuman/assets/1.1/base/'


def get(url, dest=None):
    if dest and os.path.exists(dest) and os.path.getsize(dest) > 0:
        return open(dest, 'rb').read()
    for k in range(8):
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
            if dest:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                open(dest, 'wb').write(data)
            return data
        except Exception as e:  # noqa: BLE001
            if '404' in str(e):
                return None
            time.sleep(2 + k * 3)
    raise SystemExit('no se pudo bajar ' + url)


def gh(path):
    return get(GH + path, os.path.join(CACHE, path))


def tux_dir(path, skip=('.thumb',)):
    """baja una carpeta entera del servidor (recursiva)"""
    html = get(TUX + path).decode('utf8', 'replace')
    for h in re.findall(r'<a href="([^"]+)">', html):
        if h.startswith('?') or h.startswith('/') or h == '../':
            continue
        if h.endswith('/'):
            tux_dir(path + h, skip)
        elif not h.endswith(skip):
            get(TUX + path + h, os.path.join(CACHE, path + h))


def modeling():
    """Los morfos de detalle (cara, cuello, torso, cadera…): para que cada personaje tenga su cara."""
    import json
    from concurrent.futures import ThreadPoolExecutor
    mods = json.loads(gh('modifiers/modeling_modifiers.json'))
    files = []
    for g in mods:
        if g['group'] in ('armslegs', 'genitals', 'breast') or g['group'].startswith('macrodetails'):
            continue
        for m in g['modifiers']:
            t = m.get('target')
            if not t:
                continue
            if m.get('min'):
                files += [f"targets/{g['group']}/{t}-{m['min']}.target", f"targets/{g['group']}/{t}-{m['max']}.target"]
            else:
                files.append(f"targets/{g['group']}/{t}.target")
    # pecho (solo con músculo y peso promedio): tamaño de copa y firmeza
    for a in ['young', 'old']:
        for cup in ['mincup', 'maxcup']:
            for fi in ['minfirmness', 'averagefirmness', 'maxfirmness']:
                files.append(f'targets/breast/female-{a}-averagemuscle-averageweight-{cup}-{fi}.target')
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(gh, files))
    print('morfos de detalle listos:', len(files))


def main():
    gh('3dobjs/base.obj')
    for f in ['rigs/default.mhskel', 'rigs/default_weights.mhw', 'eyes/low-poly/low-poly.mhclo', 'eyes/low-poly/low-poly.obj', 'eyes/materials/brown_eye.png']:
        gh(f)
    ages = ['baby', 'child', 'young', 'old']
    lvl = ['min', 'average', 'max']
    for g in ['female', 'male']:
        for a in ages:
            for e in ['african', 'asian', 'caucasian']:
                gh(f'targets/macrodetails/{e}-{g}-{a}.target')
            for m in lvl:
                for w in lvl:
                    gh(f'targets/macrodetails/universal-{g}-{a}-{m}muscle-{w}weight.target')
                    for hgt in ['min', 'max']:
                        gh(f'targets/macrodetails/height/{g}-{a}-{m}muscle-{w}weight-{hgt}height.target')
                    if a != 'baby':
                        for p in ['ideal', 'uncommon']:
                            gh(f'targets/macrodetails/proportions/{g}-{a}-{m}muscle-{w}weight-{p}proportions.target')
    print('GitHub listo')
    modeling()
    for d in ['proxymeshes/male1591/', 'proxymeshes/female1605/', 'eyelashes/', 'eyebrows/eyebrow001/', 'eyebrows/eyebrow006/', 'eyebrows/eyebrow010/']:
        tux_dir(d)
    for s in ['young', 'middleage', 'old']:
        for t in ['lightskinned', 'darkskinned']:
            for g in ['male', 'female']:
                get(TUX + f'skins/textures/{s}_{t}_{g}_diffuse.png', os.path.join(CACHE, f'skins/textures/{s}_{t}_{g}_diffuse.png'))
    get(TUX + 'skins/textures/young_lightskinned_male_diffuse2.png', os.path.join(CACHE, 'skins/textures/young_lightskinned_male_diffuse2.png'))
    get(TUX + 'skins/textures/young_lightskinned_female_diffuse3.png', os.path.join(CACHE, 'skins/textures/young_lightskinned_female_diffuse3.png'))
    print('pieles listas')
    for h in ['short01', 'short02', 'short03', 'short04', 'bob02', 'ponytail01', 'afro01', 'long01', 'braid01']:
        tux_dir(f'hair/{h}/')
    print('pelo listo')
    for c in ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'male_worksuit01', 'male_elegantsuit01', 'female_casualsuit01', 'female_casualsuit02', 'female_sportsuit01', 'female_elegantsuit01', 'shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06', 'fedora01']:
        tux_dir(f'clothes/{c}/')
    tux_dir('clothes/materials/') if get(TUX + 'clothes/materials/') else None
    print('ropa lista')


if __name__ == '__main__':
    main()
