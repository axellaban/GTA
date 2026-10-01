// Capturas del juego (Chromium + SwiftShader, sin GPU): node tools/shot.mjs <salida-prefijo> <json de escenas>
// Requiere el juego servido en http://localhost:4173 (npm run build && npx vite preview --port 4173).
// Cada escena: { name, hour, rain, wet, quality, cam: {x,y,z, lx,ly,lz} | 'player', wait }
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [, , prefix, scenesJson, url = 'http://localhost:4173/'] = process.argv;
const scenes = JSON.parse(scenesJson);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__gta, null, { timeout: 120000 });
console.log('cargó');

for (const s of scenes) {
  if (s.quality) {
    await page.evaluate((q) => document.querySelector(`[data-quality="${q}"]`)?.click(), s.quality);
  }
  await page.evaluate((s) => {
    const w = window.__gta;
    if (s.play && !document.getElementById('start').hidden) document.getElementById('play').click();
    w.time.hour = s.hour;
    w.weather.rain = w.weather.target = s.rain ?? 0;
    w.weather.wet = s.wet ?? 0;
    w.weather.next = 1e9;
    if (s.pos) {
      w.player.x = s.pos.x;
      w.player.z = s.pos.z;
      if (s.pos.face != null) w.player.heading = s.pos.face;
    }
    window.__cam = s.cam || null;
    if (!w.player.__patched) {
      w.player.__patched = true;
      const orig = w.player.updateCamera.bind(w.player);
      w.player.updateCamera = (cam, ...a) => {
        const c = window.__cam;
        if (!c) return orig(cam, ...a);
        const P = w.player;
        if (c.obj) {
          // primer plano de un objeto: de frente (o de costado) a cierta distancia
          const o = c.obj;
          const h = (o.heading ?? 0) + (c.side ?? 0);
          cam.position.set(o.x + Math.sin(h) * c.dist, c.y, o.z + Math.cos(h) * c.dist);
          cam.lookAt(o.x, c.ly ?? 1, o.z);
          return;
        }
        if (c.rel) {
          // relativo al jugador: detrás y arriba, mirando adelante
          const f = P.heading ?? 0;
          const fx = Math.sin(f), fz = Math.cos(f);
          cam.position.set(P.x - fx * c.back, c.y, P.z - fz * c.back);
          cam.lookAt(P.x + fx * c.ahead, c.ly ?? 1, P.z + fz * c.ahead);
        } else {
          cam.position.set(c.x, c.y, c.z);
          cam.lookAt(c.lx, c.ly, c.lz);
        }
      };
    }
  }, s);
  // dejar correr unos cuadros para que el tiempo y el clima se asienten
  await page.waitForTimeout(s.wait ?? 2500);
  const info = await page.evaluate(() => {
    const w = window.__gta;
    return { hour: w.time.hour.toFixed(2), glow: w.time.glow.toFixed(2), rain: w.weather.rain.toFixed(2), wet: w.weather.wet.toFixed(2), p: [w.player.x.toFixed(1), w.player.z.toFixed(1)] };
  });
  console.log(s.name, JSON.stringify(info));
  if (s.eval) {
    console.log('eval', s.name, await page.evaluate(s.eval));
    await page.waitForTimeout(s.after ?? 1200);
  }
  if (s.noshot) continue;
  await page.screenshot({ path: `${prefix}-${s.name}.png` });
}
await browser.close();
