# La víbora que nada en la inundación, a partir de la cobra CC0 de Micket (OpenGameArt:
# https://opengameart.org/content/cobra-0, 330 triángulos, con esqueleto). Sin abrir la interfaz:
#   pip install bpy        (probado con 5.2)
#   python3 tools/blender/vibora.py
# Toma tools/blender/fuentes/cobra.blend, la deja en su pose de reposo (estirada, como nadando), le aplica el
# espejo, angosta la capucha de cobra hasta una cabeza triangular de yarará y la lleva a 1,5 m de largo.
# Sale public/models/agua/vibora.glb: la malla sola, con la cabeza en z = 0 (mirando a +z) y la cola en
# z = -1,5; y = 0 es el eje del cuerpo. El dibujo de yarará y el nado en S los pone src/viboras.js.
import os

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'tools', 'blender', 'fuentes', 'cobra.blend')
GLB = os.path.join(ROOT, 'public', 'models', 'agua', 'vibora.glb')
LARGO = 1.5

bpy.ops.wm.open_mainfile(filepath=SRC)
arm = bpy.data.objects['Armature']
ob = bpy.data.objects['Cobra']
arm.data.pose_position = 'REST'
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
M = ob.matrix_world.copy()
co = np.array([(M @ v.co)[:] for v in me.vertices])
y0, y1 = co[:, 1].min(), co[:, 1].max()
s = LARGO / (y1 - y0)
zc = 0.31
# ancho original en cada tramo del cuerpo
edges = np.arange(0, y1 - y0 + 0.5, 0.5)
width = np.array([np.ptp(co[(co[:, 1] - y0 >= a) & (co[:, 1] - y0 < a + 0.5), 0]) if ((co[:, 1] - y0 >= a) & (co[:, 1] - y0 < a + 0.5)).any() else 0.66 for a in edges])
# ancho buscado en la cabeza y el cuello (unidades del modelo original; el cuerpo mide 0,66): cabeza
# triangular de yarará, cuello angosto, sin capucha
HEAD = [(0.0, 0.22), (0.8, 0.72), (1.8, 0.92), (2.8, 0.6), (4.0, 0.58), (5.5, 0.66)]
for v, c in zip(me.vertices, co):
    x, y, z = c
    t = y - y0  # 0 en la punta de la cabeza
    if t < 5.5:
        orig = max(0.2, np.interp(t, edges + 0.25, width))
        x *= np.interp(t, [h[0] for h in HEAD], [h[1] for h in HEAD]) / orig
    v.co = (x * s, t * s, (z - zc) * s)
me.update()
out = bpy.data.objects.new('vibora', me)
bpy.context.scene.collection.objects.link(out)
for o in list(bpy.context.scene.objects):
    o.select_set(o is out)
bpy.context.view_layer.objects.active = out
bpy.ops.object.shade_smooth()
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_normals=True, export_texcoords=False, export_materials='NONE')
d = np.array([v.co[:] for v in me.vertices])
print('vértices', len(d), 'triángulos', sum(len(p.vertices) - 2 for p in me.polygons), 'medidas', np.ptp(d, 0).round(3))
print('listo:', GLB)
