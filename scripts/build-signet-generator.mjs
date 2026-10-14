import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const bundled = await build({
  entryPoints: [new URL('./signet-setup-generator.mjs', import.meta.url).pathname],
  bundle: true, write: false, platform: 'browser', format: 'iife', minify: true,
});
const template = await readFile(new URL('./signet-setup-generator.template.html', import.meta.url), 'utf8');
const output = new URL('../generated-artifacts/signet-setup.html', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, template.replace('/* BUNDLE */', () => bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
console.log('Created generated-artifacts/signet-setup.html (contains no generated keys).');
