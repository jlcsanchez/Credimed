/**
 * Local sandbox: renders the sample claim into a filled ADA PDF +
 * placeholder POA, bundles them, writes to /tmp. No AWS calls, no
 * fax send. Use this to iterate on coordinates in ada-coordinates.js
 * before deploying.
 *
 * Run from `backend/fax/`:
 *   npm install
 *   node test/render-sample.mjs
 *   open /tmp/credimed-sample-bundle.pdf
 */

import { readFile, writeFile } from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { generateAdaPdf } from "../ada-pdf-generator.js";
import { generatePoaPdf } from "../poa-pdf-generator.js";

const claim = JSON.parse(await readFile(new URL("./sample-claim.json", import.meta.url), "utf8"));

const [adaPdf, poaPdf] = await Promise.all([
  generateAdaPdf(claim),
  generatePoaPdf(claim)
]);

await writeFile("/tmp/credimed-sample-ada.pdf", adaPdf);
await writeFile("/tmp/credimed-sample-poa.pdf", poaPdf);

const merged = await PDFDocument.create();
for (const bytes of [adaPdf, poaPdf]) {
  const src = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(src, src.getPageIndices());
  pages.forEach(p => merged.addPage(p));
}
await writeFile("/tmp/credimed-sample-bundle.pdf", await merged.save());

console.log("Wrote:");
console.log("  /tmp/credimed-sample-ada.pdf    — filled ADA J430D (2 pages)");
console.log("  /tmp/credimed-sample-poa.pdf    — placeholder POA (1 page)");
console.log("  /tmp/credimed-sample-bundle.pdf — concatenated bundle (3 pages)");
