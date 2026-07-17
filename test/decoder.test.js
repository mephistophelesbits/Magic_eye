import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp } from "../decoder.js";

test("clamp bounds a value to [a,b]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

import { boxH, boxV } from "../decoder.js";

test("boxH radius 0 is identity", () => {
  const src = Float32Array.from([1, 2, 3, 4]);
  const out = boxH(src, 4, 1, 0);
  assert.deepEqual(Array.from(out), [1, 2, 3, 4]);
});

test("boxH radius 1 averages horizontal neighbours with edge clamp", () => {
  const src = Float32Array.from([0, 3, 0]); // width 3, height 1
  const out = boxH(src, 3, 1, 1);
  // x0: (0+0+3)/3=1 ; x1: (0+3+0)/3=1 ; x2: (3+0+0)/3=1
  assert.ok(Math.abs(out[0] - 1) < 1e-6);
  assert.ok(Math.abs(out[1] - 1) < 1e-6);
  assert.ok(Math.abs(out[2] - 1) < 1e-6);
});

test("boxV radius 1 averages vertical neighbours with edge clamp", () => {
  const src = Float32Array.from([0, 3, 0]); // width 1, height 3
  const out = boxV(src, 1, 3, 1);
  assert.ok(Math.abs(out[0] - 1) < 1e-6);
  assert.ok(Math.abs(out[1] - 1) < 1e-6);
  assert.ok(Math.abs(out[2] - 1) < 1e-6);
});

import { median3, polish } from "../decoder.js";

test("median3 removes a lone speckle", () => {
  // 3x3 field of 0 with a single 1 in the centre -> median is 0 everywhere
  const w = 3, h = 3;
  const src = new Float32Array(w * h);
  src[4] = 1;
  const out = median3(src, w, h);
  assert.equal(out[4], 0);
});

test("polish returns same dimensions and stays in range", () => {
  const w = 8, h = 8;
  const src = new Float32Array(w * h).map((_, i) => (i % 2));
  const out = polish(src, w, h, 2);
  assert.equal(out.length, w * h);
  for (const v of out) assert.ok(v >= 0 && v <= 1);
});

import { detectPeriod } from "../decoder.js";

// Build an RGBA buffer, height 20, whose every row is random dots tiled at `period`.
function tiledRGBA(w, h, period, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const base = new Uint8ClampedArray(period).map(() => (rand() * 255) | 0);
    for (let x = 0; x < w; x++) {
      const v = base[x % period];
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return data;
}

test("detectPeriod finds a tiled period with high confidence", () => {
  const w = 300, h = 20, period = 40;
  const data = tiledRGBA(w, h, period);
  const { period: p, confidence } = detectPeriod(data, w, h);
  assert.ok(Math.abs(p - period) <= 1, `got period ${p}`);
  assert.ok(confidence > 0.5, `got confidence ${confidence}`);
});

test("detectPeriod reports low confidence on pure noise", () => {
  const w = 300, h = 20;
  let s = 7;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = (rand() * 255) | 0, o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
  }
  const { confidence } = detectPeriod(data, w, h);
  assert.ok(confidence < 0.2, `got confidence ${confidence}`);
});

import { decodeDepth } from "../decoder.js";

test("decodeDepth returns null when the period is too wide for the image", () => {
  const w = 60, h = 10;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  assert.equal(decodeDepth(data, w, h, 100), null);
});

test("decodeDepth on a flat tiled stereogram yields a near-uniform depth", () => {
  // Reuse tiledRGBA from the detectPeriod tests (every column equals column x-period).
  const w = 400, h = 40, period = 60;
  const data = tiledRGBA(w, h, period);
  const res = decodeDepth(data, w, h, period);
  assert.ok(res, "expected a result object");
  const sMax = Math.max(Math.round(period * 0.70) + 2, Math.round(period * 1.05));
  assert.equal(res.dw, w - sMax);
  assert.equal(res.dh, h);
  // Flat scene -> disparity is constant -> depth has almost no spread.
  let min = Infinity, max = -Infinity;
  for (const v of res.depth) { if (v < min) min = v; if (v > max) max = v; }
  assert.ok(max - min < 0.15, `depth spread ${max - min} too large for a flat scene`);
});
