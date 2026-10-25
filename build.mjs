// Builds dist/kreidebox.html: one self-contained file (JS, CSS, fonts inlined). Run: node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const src = 'src';
const css = ['styles/tokens.css', 'styles/base.css', 'styles/components.css', 'styles/app.css']
  .map((f) => {
    const file = join(src, f);
    return readFileSync(file, 'utf8').replace(/url\('([^']+\.woff2)'\)/g, (_, rel) => {
      const data = readFileSync(resolve(dirname(file), rel)).toString('base64');
      return `url(data:font/woff2;base64,${data})`;
    });
  }).join('\n');

const js = await build({ entryPoints: [join(src, 'app.js')], bundle: true, format: 'iife', minify: true, write: false, target: ['chrome100', 'safari15', 'firefox100'], legalComments: 'inline' });
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = readFileSync(join(src, 'index.html'), 'utf8')
  .replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '')
  .replace('</head>', `<style>\n${css}\n</style>\n</head>`)
  .replace('<script type="module" src="app.js"></script>', `<script>\n${script}\n</script>`);

mkdirSync('dist/icons', { recursive: true });
// dist/kreidebox.html: Einzeldatei zum Doppelklicken (kein Manifest, kein Service Worker, weil file:// beides nicht kann).
const plain = html.replace(/<!--PWA-->.*?<!--\/PWA-->/s, '').replace('<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n', '').replace(/<meta property="og:image"[^>]*>\n/, '');
writeFileSync('dist/kreidebox.html', plain);
// dist/index.html + Zusatzdateien: gehostete, installierbare Version mit Offline-Cache.
const register = `<script>if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n</body>`;
writeFileSync('dist/index.html', html.replace('</body>', register).replace(/<!--PWA-->|<!--\/PWA-->/g, ''));
const stamp = Date.now().toString(36);
writeFileSync('dist/sw.js', readFileSync(join(src, 'sw.js'), 'utf8').replace("__BUILD__", stamp));
for (const f of ['manifest.webmanifest', 'datenschutz.html']) copyFileSync(join(src, f), join('dist', f));
for (const f of readdirSync(join(src, 'icons'))) copyFileSync(join(src, 'icons', f), join('dist/icons', f));
console.log(`dist/kreidebox.html + dist/index.html ${(html.length / 1024).toFixed(0)} KB (Build ${stamp})`);
