
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const dir = path.resolve('tmp/oval-mouse-dom/screens');
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.png')).sort();
const out = [];
for (const file of files) {
  const { data, info } = await sharp(path.join(dir, file)).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const mask = new Uint8Array(w * h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * info.channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - 222) <= 3 && Math.abs(g - 222) <= 3 && Math.abs(b - 222) <= 3) {
        mask[y * w + x] = 1;
        total++;
      }
    }
  }
  const seen = new Uint8Array(w * h);
  let largest = 0, bbox = null;
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % w, y = (idx / w) | 0;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length || seen[n] || !mask[n]) continue;
        if (n === idx - 1 && x === 0) continue;
        if (n === idx + 1 && x === w - 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (count > largest) {
      largest = count;
      bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
  }
  out.push({ file, total, largestComponent: largest, bbox });
}
console.log(JSON.stringify(out, null, 2));
