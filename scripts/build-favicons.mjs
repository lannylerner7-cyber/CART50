// Regenerate all small, deployable icons from the existing brand SVG.
// Run: node scripts/build-favicons.mjs (or --check for a byte-for-byte check).
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const root = new URL('../artifacts/bitcoin-vault/public/', import.meta.url);
const svg = readFileSync(new URL('favicon.svg', root), 'utf8');
const check = process.argv.includes('--check');
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
function save(name, bytes) {
  const url = new URL(name, root);
  if (check) {
    if (!readFileSync(url).equals(bytes)) throw new Error(`Regenerate ${name}`);
  } else writeFileSync(url, bytes);
}
for (const size of [16, 32, 48, 96, 192, 512]) save(`favicon-${size}.png`, render(size).asPng());
save('apple-touch-icon.png', render(180).asPng());
// ICO uses uncompressed BGRA DIB frames plus an AND mask for older decoders.
const sizes = [16, 32, 48];
const frames = sizes.map(size => {
  const pixels = render(size).pixels;
  const maskStride = Math.ceil(size / 32) * 4;
  const dib = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const src = (y * size + x) * 4, dst = 40 + ((size - 1 - y) * size + x) * 4;
    dib[dst] = pixels[src + 2]; dib[dst + 1] = pixels[src + 1];
    dib[dst + 2] = pixels[src]; dib[dst + 3] = pixels[src + 3];
    if (!pixels[src + 3]) dib[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |= 0x80 >> (x % 8);
  }
  return dib;
});
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, i) => {
  const at = 6 + i * 16;
  directory[at] = sizes[i]; directory[at + 1] = sizes[i];
  directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
  directory.writeUInt32LE(frame.length, at + 8); directory.writeUInt32LE(offset, at + 12);
  offset += frame.length;
});
save('favicon.ico', Buffer.concat([directory, ...frames]));
console.log(`Favicons ${check ? 'verified' : 'generated'} from favicon.svg`);
