// Convierte dist/index.html en una página publicable como Artifact de claude.ai:
// el Artifact agrega su propio esqueleto (doctype, html, head, body), así que se sacan.
import { readFileSync, writeFileSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>/i, '')
  .replace(/<\/html>/i, '')
  .replace(/<head>/i, '')
  .replace(/<\/head>/i, '')
  .replace(/<body>/i, '')
  .replace(/<\/body>/i, '')
  .replace(/<meta charset="utf-8" \/>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trim();
// el <title> tiene que quedar en los primeros 8 KB
const title = html.match(/<title>.*?<\/title>/i)[0];
html = title + '\n' + html.replace(title, '');
writeFileSync('dist/artifact.html', html);
console.log(`dist/artifact.html (${(html.length / 1024).toFixed(0)} KB)`);
