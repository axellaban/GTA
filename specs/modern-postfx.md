# Spec: post-procesado moderno (`MODERN_POSTFX`)

## Objetivo

Que reVC se vea más actual sin cambiar el estilo de Vice City ni tocar los
modelos o texturas originales: bordes sin dientes de sierra, texturas más
nítidas, luces y neones con resplandor, y color más vivo.

## Comportamiento

Un pase de post-procesado que se ejecuta después del filtro de color del juego
y antes del HUD (`CPostFX::RenderModern`, llamado desde `main.cpp`). Hace, en orden:

1. **FXAA**: suaviza los bordes de los polígonos.
2. **Bloom**: extrae las zonas brillantes a 1/4 de resolución, las desenfoca
   con un gaussiano separable (3 iteraciones) y las suma a la imagen.
3. **Corrección final**: nitidez adaptativa al contraste, curva de contraste
   en S, viveza (satura más los colores apagados) y viñeta.

El HUD, los menús y los subtítulos no pasan por este pase.

## Opciones

| Dónde | Qué |
|---|---|
| Menú → Opciones → Gráficos → **POSTPROCESADO MODERNO** | NO / SUTIL (por defecto) / VÍVIDO / PERSONALIZADO |
| `reVC.ini` → `[ModernPostFX]` | `Preset`, `FXAA`, y los valores de PERSONALIZADO: `Sharpen`, `BloomIntensity`, `BloomThreshold`, `Contrast`, `Vibrance`, `Vignette` |
| Menú de depuración (Ctrl+M) → Render → Modern PostFX | Lo mismo, en tiempo real |

**NO** desactiva todo el pase (FXAA incluido) y deja la imagen exactamente como
antes. Los valores de cada preset están en `ModernFXPresets` (`src/extras/postfx.cpp`).

Además, con esta versión vienen activados por defecto los pipelines estilo Xbox
que ya existían: reflejos «Neo» en los coches, luz de contorno en los peatones
y brillo en las carreteras. Se pueden cambiar en el mismo menú.

## Criterios de aceptación

| # | Criterio | Cómo se verifica | Estado |
|---|---|---|---|
| 1 | Compila con librw en OpenGL (Linux, Windows) y en D3D9 (Windows) | Compilación (Linux con GCC, Windows con MinGW) | ✅ |
| 2 | Los shaders GLSL compilan en GLSL 3.30 y 1.20 (GL antiguo y GLES2) | `utils/postfx-preview/preview.py` | ✅ |
| 3 | Los shaders HLSL compilan dentro de los límites de su perfil (`ps_2_0`, o `ps_2_a` en FXAA y la corrección final) | `src/extras/shaders/make_hlsl_vkd3d.sh` | ✅ |
| 4 | Ningún pase lee fuera de la parte del back buffer que contiene la pantalla, a cualquier resolución | `preview.py` rellena esa zona de magenta y falla si aparece en el resultado (probado a 1280×720, 1366×768, 1920×1080 y 1001×563) | ✅ |
| 5 | Con **NO** la imagen es idéntica a la original | Por código: `RenderModern` sale antes de copiar o dibujar nada | ✅ |
| 6 | El HUD no se ve afectado | Por código: el pase se ejecuta antes de `Render2dStuff` | ✅ |
| 7 | Se ve bien en el juego, de día y de noche, sin parpadeos ni bajadas de FPS notables | Prueba manual con los archivos del juego original | ⏳ pendiente |

## Herramientas

- `utils/postfx-preview/preview.py OUTDIR captura.png ...` ejecuta los shaders
  GLSL reales sobre capturas, con los mismos pases y uniforms que el juego, y
  guarda el resultado de FXAA, SUTIL y VÍVIDO. Necesita `pip install moderngl pillow numpy`.
- `src/extras/shaders/make_hlsl_vkd3d.sh shader_PS.hlsl ...` compila HLSL sin
  Windows (con `vkd3d-compiler`) y genera los `.inc`.
  En Windows sigue sirviendo `make_hlsl.cmd`.
- Los textos del menú se añaden en `utils/gxt/*.txt` y se regeneran los `.gxt`
  con `utils/gxt/build.bat`.

## Fuera de alcance

Sombras en tiempo real, oclusión ambiental (SSAO) y reflejos en pantalla:
necesitan el buffer de profundidad y cambios en el renderizador, no solo un
post-procesado. Tampoco se pueden mejorar los modelos y texturas de 2002 desde
el código.
