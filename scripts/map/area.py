# Zona que cubre el mapa del juego, en metros (x al este, z al sur, origen en la estación Temperley).
# El cuadrado original de 1,2 km más dos franjas para que lo pedido por el dueño quede en su lugar real:
#   NORTE: Almirante Brown hasta Cerrito (Sanatorio Juncal, el paso a nivel de Cerrito y la florería)
#   ESTE:  Av. Eva Perón hasta Emilio Castro (la casa de Clau, Sanatorio Temperley)
from shapely.geometry import box
from shapely.ops import unary_union

HALF = 600
SQ0 = box(-HALF, -HALF, HALF, HALF)
NORTE = box(-320, -1100, 220, -HALF)
ESTE = box(HALF, -330, 980, 230)
AREA = unary_union([SQ0, NORTE, ESTE])
EXT = AREA.difference(SQ0)
BOUNDS = [round(v) for v in AREA.bounds]  # x0, z0, x1, z1
