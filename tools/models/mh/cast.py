# El elenco: cada personaje con sus morfos (0..1 como los deslizadores de MakeHuman), cara al azar
# ('seed'; cuánto varía: 'variety'), piel, ropa (con repintado: paint.py) y pelo. Los que tienen "_old"
# en el nombre salen canosos en el juego; lo marcado 'fixed' no cambia de color (camisetas, uniformes).
BANFIELD = {'pattern': 'stripes', 'color': '#f4f4f4', 'color2': '#1f8a3c', 'fixed': True}
TEMPERLEY = {'pattern': 'solid', 'color': '#79c4ec', 'trim': '#ffffff', 'fixed': True}
BOCA = {'pattern': 'band', 'color': '#123f8c', 'color2': '#f2c200', 'fixed': True}
RIVER = {'pattern': 'sash', 'color': '#f6f6f6', 'color2': '#d0021b', 'fixed': True}
ARGENTINA = {'pattern': 'stripes', 'color': '#f4f4f4', 'color2': '#74b9e8', 'fixed': True}
POLICIA = {'pattern': 'solid', 'color': '#9cc3e6', 'fixed': True}
AZUL = {'pattern': 'solid', 'color': '#1b2440', 'fixed': True}
JEAN = {'keep': True, 'color': '#3b4a63'}
NEGRO = {'keep': True, 'color': '#26272b'}


def LISO(c):
    return {'pattern': 'solid', 'color': c}


M = {'gender': 1, 'ethnic': {'caucasian': 0.75, 'african': 0.1, 'asian': 0.15}}
F = {'gender': 0, 'ethnic': {'caucasian': 0.75, 'african': 0.1, 'asian': 0.15}}
MORENO = {'caucasian': 0.35, 'african': 0.45, 'asian': 0.2}
OSCURO = {'hair': ['negro', 'oscuro']}  # colores de pelo posibles en el juego (gltf.scene.userData)

CAST = {
    # ---------------- varones
    'mh_banfield': dict(M, age=0.52, muscle=0.55, height=0.55, seed=1, skin='young_lightskinned_male', hair='short02',
                        clothes=['male_casualsuit02', 'shoes02'], paint={'male_casualsuit02': {'top': BANFIELD, 'bottom': JEAN}}),
    'mh_temperley': dict(M, age=0.5, muscle=0.5, weight=0.45, seed=2, skin='young_lightskinned_male_diffuse2', hair='short04',
                         clothes=['male_casualsuit02', 'shoes05'], paint={'male_casualsuit02': {'top': TEMPERLEY, 'bottom': NEGRO}}),
    'mh_boca': dict(M, extras=OSCURO, age=0.55, muscle=0.6, weight=0.55, seed=3, ethnic=MORENO, skin='young_darkskinned_male', hair='short03',
                    clothes=['male_casualsuit02', 'shoes02'], paint={'male_casualsuit02': {'top': BOCA, 'bottom': JEAN}}),
    'mh_river': dict(M, age=0.58, muscle=0.5, weight=0.5, height=0.6, seed=4, skin='young_lightskinned_male', hair='short01',
                     clothes=['male_casualsuit02', 'shoes05'], paint={'male_casualsuit02': {'top': RIVER, 'bottom': NEGRO}}),
    'mh_pibe': dict(M, age=0.46, muscle=0.45, weight=0.35, height=0.5, seed=11, skin='young_lightskinned_male_diffuse2', hair='short02',
                    clothes=['male_casualsuit04', 'shoes05'], paint={'male_casualsuit04': {'top': ARGENTINA, 'bottom': JEAN}}),
    'mh_laburante': dict(M, extras=OSCURO, tint=False, age=0.68, muscle=0.6, weight=0.65, seed=5, ethnic=MORENO, skin='middleage_darkskinned_male', hair='short02',
                         clothes=['male_worksuit01', 'shoes01']),
    'mh_oficinista': dict(M, age=0.66, muscle=0.45, weight=0.55, height=0.6, seed=6, skin='middleage_lightskinned_male', hair='short01',
                          clothes=['male_elegantsuit01', 'shoes04']),
    'mh_gordo': dict(M, age=0.7, muscle=0.3, weight=0.95, height=0.45, seed=8, skin='middleage_lightskinned_male', hair=None,
                     clothes=['male_casualsuit06', 'shoes02'], paint={'male_casualsuit06': {'top': LISO('#e9e4da'), 'bottom': JEAN}}),
    'mh_flaco': dict(M, age=0.5, muscle=0.35, weight=0.15, height=0.75, seed=9, skin='young_lightskinned_male', hair='short01',
                     clothes=['male_casualsuit01', 'shoes05']),
    'mh_musculoso': dict(M, extras=OSCURO, age=0.55, muscle=0.98, weight=0.6, height=0.6, seed=10, ethnic=MORENO, skin='young_darkskinned_male', hair='short04',
                         clothes=['male_casualsuit05', 'shoes02']),
    'mh_rayado': dict(M, age=0.62, muscle=0.5, weight=0.6, seed=12, skin='middleage_lightskinned_male', hair='short03',
                      clothes=['male_casualsuit03', 'shoes04']),
    'mh_jubilado_old': dict(M, age=0.93, muscle=0.35, weight=0.6, height=0.4, seed=7, skin='old_lightskinned_male', hair='short03',
                            clothes=['male_casualsuit03', 'shoes01'], paint={'male_casualsuit03': {'bottom': {'keep': True, 'color': '#b8a98a'}}}),
    'mh_abuelo_old': dict(M, age=0.88, muscle=0.4, weight=0.7, seed=13, ethnic=MORENO, skin='old_darkskinned_male', hair=None,
                          clothes=['male_elegantsuit01', 'shoes04']),
    # ---------------- mujeres
    'mh_f_remera': dict(F, age=0.5, muscle=0.5, weight=0.45, cup=0.65, seed=21, skin='young_lightskinned_female', hair='long01',
                        clothes=['female_casualsuit01', 'shoes05'], paint={'female_casualsuit01': {'top': LISO('#e8566f'), 'bottom': JEAN}}),
    'mh_f_short': dict(F, extras=OSCURO, age=0.5, muscle=0.5, weight=0.4, cup=0.6, seed=22, ethnic=MORENO, skin='young_darkskinned_female', hair='ponytail01',
                       clothes=['female_casualsuit02', 'shoes05'], paint={'female_casualsuit02': {'top': LISO('#f2d25c'), 'bottom': JEAN}}),
    'mh_f_deporte': dict(F, age=0.48, muscle=0.6, weight=0.35, height=0.6, cup=0.55, seed=23, skin='young_lightskinned_female_diffuse3', hair='bob02',
                         clothes=['female_sportsuit01', 'shoes05'], paint={'female_sportsuit01': {'top': LISO('#38b6a8'), 'bottom': NEGRO}}),
    'mh_f_vestido': dict(F, age=0.55, muscle=0.45, weight=0.45, height=0.55, cup=0.7, seed=24, skin='young_lightskinned_female', hair='braid01',
                         clothes=['female_elegantsuit01', 'shoes03']),
    'mh_f_madre': dict(F, age=0.68, muscle=0.4, weight=0.72, cup=0.75, seed=25, skin='middleage_lightskinned_female', hair='bob02',
                       clothes=['female_casualsuit01', 'shoes02'], paint={'female_casualsuit01': {'top': LISO('#7d5ba6'), 'bottom': JEAN}}),
    'mh_f_afro': dict(F, extras=OSCURO, age=0.52, muscle=0.55, weight=0.45, cup=0.6, seed=26, ethnic={'african': 0.7, 'caucasian': 0.2, 'asian': 0.1},
                      skin='young_darkskinned_female', hair='afro01',
                      clothes=['female_sportsuit01', 'shoes05'], paint={'female_sportsuit01': {'top': LISO('#f28c28'), 'bottom': JEAN}}),
    'mh_f_abuela_old': dict(F, age=0.92, muscle=0.3, weight=0.65, height=0.35, cup=0.6, firmness=0.1, seed=27, skin='old_lightskinned_female', hair='short03',
                            clothes=['female_casualsuit01', 'shoes01'],
                            paint={'female_casualsuit01': {'top': LISO('#b9a3cf'), 'bottom': {'keep': True, 'color': '#5a5560'}}}),
    # ---------------- policía (Bonaerense: camisa celeste, pantalón azul)
    'mh_policia': dict(M, age=0.58, muscle=0.65, weight=0.55, height=0.6, seed=31, skin='young_lightskinned_male', hair='short04',
                       clothes=['male_casualsuit02', 'shoes04'], paint={'male_casualsuit02': {'top': POLICIA, 'bottom': AZUL}}),
    'mh_policia_f': dict(F, age=0.56, muscle=0.6, weight=0.45, cup=0.55, seed=32, skin='young_lightskinned_female', hair='ponytail01',
                         clothes=['female_casualsuit01', 'shoes04'], paint={'female_casualsuit01': {'top': POLICIA, 'bottom': AZUL}}),
    # ---------------- Gaspi (el protagonista): traje negro, camisa blanca, corbata roja a rayas y la cara de
    # la foto (src/gaspi-face.webp: la caja de la cara en metros, con los ojos y el mentón donde están)
    'mh_gaspi': dict(M, age=0.56, muscle=0.5, weight=0.62, height=0.8, seed=99, variety=0.25, skin='young_lightskinned_male',
                     hair='short02', brows=None, clothes=['male_elegantsuit01', 'shoes04'],
                     paint={'male_elegantsuit01': {'recolor': [{'box': (0.35, 0.075, 0.42, 0.19), 'to': '#c8102e'}]}},
                     photo={'file': 'src/gaspi-face.webp', 'eye_y': 1.70, 'chin_y': 1.565, 'x0': -0.13, 'x1': 0.13, 'y0': 1.545, 'y1': 1.835, 'sat': 0.78, 'gain': 1.06},
                     extras={'hair': ['oscuro']}),
    # ---------------- especiales: los sistemas hechos para makeHuman (trapitos, panchero, bandas, chicos…)
    # los visten con makeLook (src/people.js): gris claro = color que se impone en el juego
    'mh_linyera': dict(M, age=0.78, muscle=0.4, weight=0.35, height=0.5, seed=41, skin='middleage_lightskinned_male', hair='long01',
                       beard={'kind': 'full', 'color': '#3a2c22'}, clothes=['male_casualsuit01', 'shoes01'], extras={'hair': ['oscuro', 'castano']},
                       paint={'male_casualsuit01': {'top': {'keep': True, 'color': '#5a4c3e'}, 'bottom': {'keep': True, 'color': '#3e3a36'}}}),
    'mh_bigote': dict(M, age=0.72, muscle=0.5, weight=0.85, height=0.5, seed=42, skin='middleage_lightskinned_male', hair='short02',
                      beard={'kind': 'mustache', 'color': '#2b2018'}, clothes=['male_casualsuit02', 'shoes02'],
                      paint={'male_casualsuit02': {'top': LISO('#d8d8d8'), 'bottom': JEAN}}),
    'mh_armero_old': dict(M, age=0.82, muscle=0.85, weight=0.75, height=0.6, seed=43, skin='old_lightskinned_male', hair='short04',
                          beard={'kind': 'mustache', 'color': '#6a6560'}, clothes=['male_casualsuit04', 'shoes01'],
                          paint={'male_casualsuit04': {'top': LISO('#d8d8d8'), 'bottom': {'keep': True, 'color': '#2b2f2a'}}}),
    'mh_barba': dict(M, age=0.6, muscle=0.6, weight=0.55, seed=44, skin='young_lightskinned_male', hair='short03',
                     beard={'kind': 'stubble', 'color': '#2b2018'}, clothes=['male_casualsuit02', 'shoes05'],
                     paint={'male_casualsuit02': {'top': LISO('#d8d8d8'), 'bottom': JEAN}}),
    'mh_chico': dict(M, age=0.3, muscle=0.5, weight=0.45, seed=45, skin='young_lightskinned_male', hair='short02', variety=0.4,
                     clothes=['male_casualsuit02', 'shoes05'], paint={'male_casualsuit02': {'top': LISO('#d8d8d8'), 'bottom': JEAN}}),
    'mh_chica': dict(F, age=0.3, muscle=0.5, weight=0.45, seed=46, skin='young_lightskinned_female', hair='ponytail01', variety=0.4,
                     clothes=['female_casualsuit02', 'shoes05'], paint={'female_casualsuit02': {'top': LISO('#d8d8d8'), 'bottom': JEAN}}),
    # ---------------- personajes (makeStar): el Comandante y Laban de traje blanco, Ciro en cuero, las chicas
    'mh_comandante': dict(M, age=0.62, muscle=0.8, weight=0.5, height=0.62, seed=47, skin='middleage_lightskinned_male', hair='short01',
                          clothes=['male_elegantsuit01', 'shoes04'],
                          paint={'male_elegantsuit01': {'top': dict(LISO('#f3f1ea'), fixed=True), 'bottom': dict(LISO('#f3f1ea'), fixed=True)}}),
    'mh_laban': dict(M, age=0.6, muscle=0.55, weight=0.55, height=0.6, seed=48, skin='middleage_lightskinned_male', hair='short02',
                     clothes=['male_elegantsuit01', 'shoes04', 'fedora01/fedora'],
                     paint={'male_elegantsuit01': {'top': dict(LISO('#f4f2ec'), fixed=True), 'bottom': dict(LISO('#f4f2ec'), fixed=True)},
                            'fedora01/fedora': {'colorize': '#f4f2ec'}}),
    'mh_ciro': dict(M, extras=OSCURO, age=0.55, muscle=1.0, weight=0.85, height=0.4, seed=49, ethnic={'caucasian': 1.0}, skin='young_lightskinned_male',
                    mods={'torso/torso-muscle-pectoral-decr|incr': 1.0, 'torso/torso-muscle-dorsi-decr|incr': 1.0,
                          'armslegs/r-upperarm-muscle-decr|incr': 1.0, 'armslegs/r-upperarm-shoulder-muscle-decr|incr': 1.0,
                          'armslegs/r-upperarm-scale-horiz-decr|incr': 1.0, 'armslegs/r-upperarm-scale-depth-decr|incr': 1.0,
                          'armslegs/r-lowerarm-muscle-decr|incr': 1.0,
                          'armslegs/r-lowerarm-scale-depth-decr|incr': 0.65, 'armslegs/r-lowerarm-scale-horiz-decr|incr': 0.65,
                          'torso/torso-scale-depth-decr|incr': 0.45}, hair='short04',
                    clothes=['male_casualsuit02', 'shoes02'], drop={'male_casualsuit02': ['top']},
                    paint={'male_casualsuit02': {'bottom': {'keep': True, 'color': '#232323'}}}),
    'mh_f_fiesta': dict(F, age=0.48, muscle=0.5, weight=0.4, cup=0.72, seed=50, skin='young_lightskinned_female', hair='long01',
                        clothes=['female_elegantsuit01', 'shoes03'],
                        paint={'female_elegantsuit01': {'top': LISO('#d8d8d8'), 'bottom': dict(LISO('#d8d8d8'), tint=True)}}),
    'mh_f_gym': dict(F, age=0.48, muscle=0.65, weight=0.35, cup=0.66, seed=51, skin='young_lightskinned_female_diffuse3', hair='ponytail01',
                     clothes=['female_sportsuit01', 'shoes05'],
                     paint={'female_sportsuit01': {'top': LISO('#d8d8d8'), 'bottom': dict(LISO('#d8d8d8'), tint=True)}}),
    # ---------------- la Selección en la plaza (src/seleccion.js): camiseta albiceleste, pantalón corto
    # negro (el pantalón largo cortado arriba de la rodilla: 'shorts') y medias blancas pintadas en la piel
    # ('socks'). Messi: bajito, barba castaña tupida. Hechos acá, sin fotos (como el Comandante).
    'mh_messi': dict(M, extras={'hair': ['castano', 'oscuro']}, age=0.61, muscle=0.62, weight=0.42, height=0.3, seed=60, variety=0.3,
                     skin='young_lightskinned_male', hair='short02', beard={'kind': 'full', 'color': '#3a281b'},
                     clothes=['male_casualsuit04', 'shoes05'], shorts={'male_casualsuit04': 0.14}, socks='#f4f4f4',
                     paint={'male_casualsuit04': {'top': ARGENTINA, 'bottom': LISO('#19191c')}}),
    'mh_sel_a': dict(M, age=0.53, muscle=0.66, weight=0.4, height=0.55, seed=61, skin='young_lightskinned_male', hair='short01',
                     clothes=['male_casualsuit04', 'shoes05'], shorts={'male_casualsuit04': 0.14}, socks='#f4f4f4',
                     paint={'male_casualsuit04': {'top': ARGENTINA, 'bottom': LISO('#19191c')}}),
    'mh_sel_b': dict(M, age=0.57, muscle=0.7, weight=0.45, height=0.6, seed=62, skin='young_lightskinned_male_diffuse2', hair='short03',
                     beard={'kind': 'full', 'color': '#2b2018'},
                     clothes=['male_casualsuit04', 'shoes05'], shorts={'male_casualsuit04': 0.14}, socks='#f4f4f4',
                     paint={'male_casualsuit04': {'top': ARGENTINA, 'bottom': LISO('#19191c')}}),
    'mh_sel_c': dict(M, extras=OSCURO, age=0.55, muscle=0.72, weight=0.42, height=0.65, seed=63, ethnic=MORENO, skin='young_darkskinned_male', hair='short04',
                     beard={'kind': 'stubble', 'color': '#1d1611'},
                     clothes=['male_casualsuit04', 'shoes05'], shorts={'male_casualsuit04': 0.14}, socks='#f4f4f4',
                     paint={'male_casualsuit04': {'top': ARGENTINA, 'bottom': LISO('#19191c')}}),
    # los arqueros: buzo verde liso
    'mh_sel_arquero': dict(M, age=0.6, muscle=0.6, weight=0.5, height=0.8, seed=64, skin='middleage_lightskinned_male', hair='short02',
                           beard={'kind': 'stubble', 'color': '#2b2018'},
                           clothes=['male_casualsuit04', 'shoes05'], shorts={'male_casualsuit04': 0.14}, socks='#2fb35a',
                           paint={'male_casualsuit04': {'top': {'pattern': 'solid', 'color': '#36c46a', 'trim': '#1b1b1b', 'fixed': True},
                                                        'bottom': LISO('#19191c')}}),
}
