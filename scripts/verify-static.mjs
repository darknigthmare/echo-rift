import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = ['index.html', 'styles.css', 'content.js', 'storage.js', 'audio-engine.js', 'game.js', 'sw.js', 'manifest.webmanifest', 'assets/icon.svg'];
await Promise.all(required.map(name => readFile(path.join(root, name))));

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const versionText = await readFile(path.join(root, 'VERSION.txt'), 'utf8');
if (!versionText.includes(`Version ${packageJson.version}`)) throw new Error('VERSION.txt et package.json sont désynchronisés.');

const context = { window: {} };
vm.runInNewContext(await readFile(path.join(root, 'content.js'), 'utf8'), context, { filename: 'content.js' });
const content = context.window.EchoContent;
const checks = [
  ['échos', content.TRACKS, 72],
  ['catégories', Object.keys(content.CATEGORIES), 11],
  ['secteurs', content.CAMPAIGN_SECTORS, 5],
  ['types', Object.keys(content.QUESTION_TYPES), 5],
  ['succès', content.ACHIEVEMENTS, 6]
];
for (const [label, collection, expected] of checks) {
  if (collection.length !== expected) throw new Error(`${label}: ${collection.length}, attendu ${expected}`);
}
if (new Set(content.TRACKS.map(track => track.id)).size !== content.TRACKS.length) throw new Error('Identifiants de pistes dupliqués.');
if (new Set(content.TRACKS.map(track => track.title)).size !== content.TRACKS.length) throw new Error('Titres intégrés dupliqués.');

const standalone = await readFile(path.join(root, 'JOUER_ECHO_RIFT.html'), 'utf8');
if (!standalone.includes(`name="echo-rift-version" content="${packageJson.version}"`)) throw new Error('Version autonome obsolète.');
if (/\b(?:src|href)="(?:styles|content|storage|audio-engine|game)\.(?:css|js)"/.test(standalone)) throw new Error('Dépendance externe dans la version autonome.');

const readTree = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (['.git', '.vercel', 'node_modules', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await readTree(absolute));
    else output.push(absolute);
  }
  return output;
};
const forbiddenProduction = 'https://echo-rift' + '.vercel.app';
for (const file of await readTree(root)) {
  if (!/\.(?:bat|css|html|js|json|md|mjs|py|sh|txt|webmanifest)$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  if (text.includes(forbiddenProduction)) throw new Error(`Ancienne cible Vercel interdite dans ${path.relative(root, file)}`);
}

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
if (!readme.includes('https://echo-rift-opal.vercel.app')) throw new Error('URL de production correcte absente du README.');
const ignored = await readFile(path.join(root, '.vercelignore'), 'utf8');
for (const privatePath of ['tests/', 'SOURCE_PROVENANCE.md', '.env*']) {
  if (!ignored.includes(privatePath)) throw new Error(`${privatePath} doit être exclu du déploiement.`);
}

console.log('Vérification statique : OK (72 échos, PWA, autonome, version, cible Vercel)');
