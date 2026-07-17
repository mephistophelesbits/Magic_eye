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
