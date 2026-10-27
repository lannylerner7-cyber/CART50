import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { address } from "bitcoinjs-lib";

test("actual branded wallet QR renders and decodes with centered local logo and quiet zone", () => {
  const frontend = fileURLToPath(new URL("../../../bitcoin-vault/", import.meta.url));
  const source = `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import {BrandedQr} from './src/components/branded-qr';
    export const render = (value, size) => renderToStaticMarkup(<BrandedQr value={value} size={size} title="Receive"/>);`;
  const built = buildSync({
    stdin: {contents:source, loader:"tsx", resolveDir:frontend}, bundle:true, write:false,
    platform:"node", format:"cjs", jsx:"automatic", tsconfig:`${frontend}/tsconfig.json`,
    define: {"import.meta.env.BASE_URL":'"/"', "process.env.NODE_ENV":'"production"'},
  });
  const module = {exports:{} as {render: (value: string, size: number) => string}};
  new Function("require","module","exports",built.outputFiles[0]!.text)(createRequire(import.meta.url),module,module.exports);
  const logo = readFileSync(`${frontend}/public/assets/strongroom/brand/main-vault-mark.svg`);
  const values = ["bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", `bitcoin:${address.toBech32(Buffer.alloc(32, 1), 1, "bc")}`];
  for (const size of [148, 186]) for (const value of values) {
    const rendered = module.exports.render(value,size);
    const svg = rendered.slice(rendered.indexOf("<svg"),rendered.indexOf("</svg>")+6)
      .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace("/assets/strongroom/brand/main-vault-mark.svg",`data:image/svg+xml;base64,${logo.toString("base64")}`);
    assert.match(svg, /<image/);
    const dimensions = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    const image = svg.match(/<image[^>]*>/)![0];
    const attr = (name: string) => Number(image.match(new RegExp(` ${name}="([^"]+)"`))![1]);
    assert.ok(Math.abs(attr("x") + attr("width") / 2 - Number(dimensions[1])/2) < 0.01);
    assert.ok(Math.abs(attr("y") + attr("height") / 2 - Number(dimensions[2])/2) < 0.01);
    const renderedImage = new Resvg(svg).render();
    const decoded = jsQR(new Uint8ClampedArray(renderedImage.pixels),renderedImage.width,renderedImage.height);
    assert.equal(decoded?.data, value, `QR at ${size}px must preserve the exact Bitcoin URI`);
  }
});
