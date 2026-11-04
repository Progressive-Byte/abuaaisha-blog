// Generates 640px card thumbnails for every repo image (public/images/posts, public/images/site).
// Runs before dev and build; output in public/images/thumbs is git-ignored and rebuilt as needed,
// so images uploaded through the CMS or committed by the AI function get thumbs automatically.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 640;
const root = path.resolve("public/images");
const outDir = path.join(root, "thumbs");
fs.mkdirSync(outDir, { recursive: true });

let made = 0;
for (const dir of ["posts", "site"]) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) continue;
  for (const file of fs.readdirSync(src)) {
    if (!/\.(webp|jpe?g|png|avif)$/i.test(file)) continue;
    const input = path.join(src, file);
    const output = path.join(outDir, `${path.parse(file).name}-${WIDTH}.webp`);
    if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(input).mtimeMs) continue;
    await sharp(input).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 74 }).toFile(output);
    made++;
  }
}
console.log(`thumbs: ${made} generated`);
