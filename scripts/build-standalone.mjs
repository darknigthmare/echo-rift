import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionText = await readFile(path.join(root, 'VERSION.txt'), 'utf8');
const version = versionText.match(/Version\s+([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
if (!version) throw new Error('Version introuvable dans VERSION.txt');

let html = await readFile(path.join(root, 'index.html'), 'utf8');
const css = await readFile(path.join(root, 'styles.css'), 'utf8');
const icon = await readFile(path.join(root, 'assets', 'icon.svg'), 'utf8');

html = html
  .replace('<link rel="manifest" href="manifest.webmanifest">', `<!-- Version autonome ECHO RIFT ${version} -->`)
  .replace('<link rel="icon" href="assets/icon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" type="image/svg+xml">`)
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('</head>', `  <meta name="echo-rift-version" content="${version}">\n</head>`);

for (const name of ['content.js', 'storage.js', 'audio-engine.js', 'game.js']) {
  const source = (await readFile(path.join(root, name), 'utf8')).replace(/<\/script/gi, '<\\/script');
  html = html.replace(`<script src="${name}"></script>`, `<script>\n${source}\n</script>`);
}

if (/\b(?:src|href)="(?:styles|content|storage|audio-engine|game)\.(?:css|js)"/.test(html)) {
  throw new Error('La version autonome contient encore une dépendance runtime externe.');
}

await writeFile(path.join(root, 'JOUER_ECHO_RIFT.html'), html, 'utf8');
console.log(`Version autonome générée : ECHO RIFT ${version}`);
