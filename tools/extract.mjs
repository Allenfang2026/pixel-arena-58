// Turn the upscaled JPEG sprites back into exact 58x58 indexed pixel data.
// usage: node extract.mjs <bmpDir> <pixelfxRoot>
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [bmpDir, fxRoot] = process.argv.slice(2);
const { encodePNG } = await import(pathToFileURL(join(fxRoot, "tools/lib/png.mjs")));

function readBMP(file) {
  const b = readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), hRaw = b.readInt32LE(22), bpp = b.readUInt16LE(28);
  const h = Math.abs(hRaw), bytes = bpp / 8, stride = Math.ceil((w * bytes) / 4) * 4;
  const px = (x, y) => {
    const row = hRaw > 0 ? h - 1 - y : y, i = off + row * stride + x * bytes;
    return [b[i + 2], b[i + 1], b[i]];
  };
  return { w, h, px };
}

// average the middle of each logical pixel's block
function sample(img, x0, y0, cell, N = 58) {
  const out = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cx = x0 + (x + 0.5) * cell, cy = y0 + (y + 0.5) * cell, r = Math.max(1, Math.floor(cell * 0.2));
      let s = [0, 0, 0], n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const p = img.px(Math.min(img.w - 1, Math.max(0, Math.round(cx + dx))), Math.min(img.h - 1, Math.max(0, Math.round(cy + dy))));
          s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++;
        }
      out.push([s[0] / n, s[1] / n, s[2] / n]);
    }
  return out;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// greedy clustering, then merge down: JPEG noise sits well inside the threshold
function quantize(pixels, thr = 60) {
  const cl = [];
  for (const p of pixels) {
    let best = null, bd = thr;
    for (const c of cl) { const d = dist(p, c.mean); if (d < bd) { bd = d; best = c; } }
    if (!best) cl.push((best = { sum: [0, 0, 0], n: 0, mean: [...p] }));
    best.sum[0] += p[0]; best.sum[1] += p[1]; best.sum[2] += p[2]; best.n++;
    best.mean = best.sum.map((v) => v / best.n);
  }
  // drop tiny clusters (blends at edges) into their nearest big neighbour
  const big = cl.filter((c) => c.n >= 6);
  const pal = big.map((c) => c.mean.map(Math.round));
  // snap near-white and near-black
  for (const c of pal) {
    if (Math.min(...c) > 225) c.fill(255);
    if (Math.max(...c) < 40) c.fill(0);
  }
  const idx = pixels.map((p) => {
    let bi = 0, bd = 1e9;
    pal.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } });
    return bi;
  });
  return { pal, idx };
}

// white connected to the border is background
function cutBackground(pal, idx, N = 58) {
  const white = pal.findIndex((c) => c[0] === 255 && c[1] === 255 && c[2] === 255);
  const out = idx.slice(), seen = new Uint8Array(N * N), st = [];
  for (let i = 0; i < N; i++) st.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
  while (st.length) {
    const i = st.pop();
    if (seen[i] || idx[i] !== white) continue;
    seen[i] = 1; out[i] = -1;
    const x = i % N, y = (i / N) | 0;
    if (x > 0) st.push(i - 1); if (x < N - 1) st.push(i + 1);
    if (y > 0) st.push(i - N); if (y < N - 1) st.push(i + N);
  }
  return out;
}

const jobs = [
  ["m0", "7.bmp", 0, 0, 10], ["m1", "8.bmp", 0, 0, 10], ["m2", "9.bmp", 0, 0, 10], ["m3", "10.bmp", 0, 0, 10],
  ...[0, 1, 2, 3, 4].map((i) => ["t" + i, "11.bmp", i * 400, 0, 400 / 58]),
];

const N = 58, result = {}, K = 6;
const sheet = new Uint8Array(jobs.length * N * K * N * K * 4).fill(90);
const SW = jobs.length * N * K;
jobs.forEach(([name, file, x0, y0, cell], j) => {
  const img = readBMP(join(bmpDir, file));
  const { pal, idx } = quantize(sample(img, x0, y0, cell));
  const cut = cutBackground(pal, idx);
  result[name] = { pal: pal.map((c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("")), px: cut.map((i) => (i < 0 ? "." : i.toString(36))).join("") };
  console.log(name, "colors:", result[name].pal.join(" "));
  for (let y = 0; y < N * K; y++)
    for (let x = 0; x < N * K; x++) {
      const i = cut[((y / K) | 0) * N + ((x / K) | 0)], o = (y * SW + j * N * K + x) * 4;
      const c = i < 0 ? ((((x >> 3) + (y >> 3)) & 1) ? [70, 70, 80] : [90, 90, 100]) : pal[i];
      sheet[o] = c[0]; sheet[o + 1] = c[1]; sheet[o + 2] = c[2]; sheet[o + 3] = 255;
    }
});
writeFileSync(join(here, "..", "sprites.js"), "// 58x58 indexed sprites: pal = colors, px = one base36 digit per pixel, '.' = transparent\nexport const SPRITES = " + JSON.stringify(result, null, 1) + ";\n");
writeFileSync(join(here, "..", "sprites-check.png"), encodePNG(SW, N * K, sheet));
console.log("ok");
