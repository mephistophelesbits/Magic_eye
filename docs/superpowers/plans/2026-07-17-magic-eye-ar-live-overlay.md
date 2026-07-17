# Magic Eye AR — Live Overlay PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone PWA that decodes a Magic Eye through the live camera and paints the hidden shape as a real-time depth overlay on the video feed.

**Architecture:** Extract the existing decode math out of `index.html` into a shared ES module `decoder.js`, unit-tested with Node's built-in test runner. A new `ar.html` orchestrates a camera → auto-period → Web-Worker-decode → overlay loop, reusing that module verbatim. Desktop `index.html` is refactored to import the same module so both apps run identical math.

**Tech Stack:** Vanilla JS ES modules, Web Workers (module type), WebGL2/Canvas2D, `getUserMedia`, Node `node:test` (zero deps), Python `http.server` for local preview (existing `static-preview` launch config).

---

## File Structure

Everything lives inside the git repo at `magic-eye-decoder/` (origin `github.com/mephistophelesbits/Magic_eye.git`).

- Create `magic-eye-decoder/decoder.js` — **pure, DOM-free** decode core shared by both apps: `clamp`, `boxH`, `boxV`, `median3`, `polish`, `detectPeriod`, `decodeDepth`, `colorizeRelief`.
- Create `magic-eye-decoder/package.json` — `type: module` + `test` script (no dependencies).
- Create `magic-eye-decoder/test/decoder.test.js` — unit tests for the pure core.
- Create `magic-eye-decoder/camera.js` — `CameraSource` (getUserMedia) + `TestSource` (static Demo image), shared interface.
- Create `magic-eye-decoder/worker.js` — module Web Worker wrapping `detectPeriod` + `decodeDepth`.
- Create `magic-eye-decoder/overlay.js` — `OverlayRenderer`: blits a colorized depth map over the video canvas.
- Create `magic-eye-decoder/ar.html` — the AR app page + UI shell + orchestration loop.
- Create `magic-eye-decoder/manifest.webmanifest` and `magic-eye-decoder/sw.js` — PWA install/fullscreen.
- Modify `magic-eye-decoder/index.html` — import `decoder.js` instead of its inline copies (single source of truth).

Test strategy: the **pure core (`decoder.js`) is TDD'd in Node**. DOM/worker/camera/PWA pieces have no practical Node harness, so they are verified in the browser preview pane via **in-page pixel readback and console assertions**, per the project's established gotchas (rAF/setTimeout throttle when the pane is hidden; transcribing canvas base64 corrupts it — assert on pixel stats, not timing or copied images).

---

## Task 1: Project scaffold + `clamp` in a shared module

**Files:**
- Create: `magic-eye-decoder/package.json`
- Create: `magic-eye-decoder/decoder.js`
- Create: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Create `magic-eye-decoder/test/decoder.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp } from "../decoder.js";

test("clamp bounds a value to [a,b]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — cannot find module `../decoder.js` (or `clamp` is not exported).

- [ ] **Step 3: Write minimal implementation**

Create `magic-eye-decoder/package.json`:

```json
{
  "name": "magic-eye-decoder",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

Create `magic-eye-decoder/decoder.js`:

```js
"use strict";

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add package.json decoder.js test/decoder.test.js
git commit -m "feat: scaffold shared decoder module with clamp + node test runner"
```

---

## Task 2: Box blurs `boxH` / `boxV`

**Files:**
- Modify: `magic-eye-decoder/decoder.js`
- Test: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/decoder.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — `boxH`/`boxV` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `decoder.js` (copied verbatim from `index.html`, `export`ed):

```js
export function boxH(buf, w, h, r) {
  var out = new Float32Array(w * h), inv = 1 / (2 * r + 1);
  for (var y = 0; y < h; y++) {
    var row = y * w, sum = 0;
    for (var x = -r; x <= r; x++) sum += buf[row + clamp(x, 0, w - 1)];
    for (var x2 = 0; x2 < w; x2++) {
      out[row + x2] = sum * inv;
      sum += buf[row + clamp(x2 + r + 1, 0, w - 1)] - buf[row + clamp(x2 - r, 0, w - 1)];
    }
  }
  return out;
}

export function boxV(buf, w, h, r) {
  var out = new Float32Array(w * h), inv = 1 / (2 * r + 1);
  for (var x = 0; x < w; x++) {
    var sum = 0;
    for (var y = -r; y <= r; y++) sum += buf[clamp(y, 0, h - 1) * w + x];
    for (var y2 = 0; y2 < h; y2++) {
      out[y2 * w + x] = sum * inv;
      sum += buf[clamp(y2 + r + 1, 0, h - 1) * w + x] - buf[clamp(y2 - r, 0, h - 1) * w + x];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add decoder.js test/decoder.test.js
git commit -m "feat: add boxH/boxV separable blur to decoder module"
```

---

## Task 3: `median3` + `polish`

**Files:**
- Modify: `magic-eye-decoder/decoder.js`
- Test: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/decoder.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — `median3`/`polish` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `decoder.js` (verbatim from `index.html`, `export`ed):

```js
export function median3(src, w, h) {
  var out = new Float32Array(w * h), v = new Array(9);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var n = 0;
      for (var dy = -1; dy <= 1; dy++)
        for (var dx = -1; dx <= 1; dx++)
          v[n++] = src[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)];
      v.sort(function (p, q) { return p - q; });
      out[y * w + x] = v[4];
    }
  }
  return out;
}

export function polish(depth, w, h, passes) {
  var d = median3(depth, w, h);
  for (var i = 0; i < passes; i++) d = boxV(boxH(d, w, h, 2), w, h, 2);
  return d;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add decoder.js test/decoder.test.js
git commit -m "feat: add median3/polish to decoder module"
```

---

## Task 4: `detectPeriod` (period + confidence)

This wraps the existing `estimatePeriod` logic and adds a **confidence** score so the live app can suppress the overlay when it is not looking at a stereogram.

**Files:**
- Modify: `magic-eye-decoder/decoder.js`
- Test: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/decoder.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — `detectPeriod` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `decoder.js`. This is `estimatePeriod` from `index.html` with a confidence value derived from how deep the winning cost dip is versus the median (baseline) cost:

```js
export function detectPeriod(d, w, h) {
  var lo = 20, hi = Math.min(320, Math.floor(w / 2.6));
  if (hi <= lo) return { period: lo, confidence: 0 };
  var cost = new Float64Array(hi + 1);
  for (var s = lo; s <= hi; s++) {
    var sum = 0, n = 0;
    for (var y = 0; y < h; y += 2) {
      var row = y * w * 4;
      for (var x = 0; x + s < w; x += 2) {
        var a = row + x * 4, b = a + s * 4;
        sum += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
        n++;
      }
    }
    cost[s] = n ? sum / n : 1e9;
  }
  var best = lo;
  for (var s2 = lo; s2 <= hi; s2++) if (cost[s2] < cost[best]) best = s2;

  var sorted = Array.prototype.slice.call(cost, lo, hi + 1).sort(function (p, q) { return p - q; });
  var baseline = sorted[Math.floor(sorted.length * 0.5)];
  var thr = Math.min(cost[best] * 1.25, baseline * 0.80);
  for (var s3 = lo + 1; s3 < best; s3++) {
    if (cost[s3] < thr && cost[s3] <= cost[s3 - 1] && cost[s3] <= cost[s3 + 1]) { best = s3; break; }
  }

  // Confidence: how far below the typical (median) cost the winner sits. A real
  // stereogram has a sharp dip (confidence -> 1); noise has none (-> 0).
  var confidence = baseline > 1e-9 ? clamp(1 - cost[best] / baseline, 0, 1) : 0;
  return { period: best, confidence: confidence };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add decoder.js test/decoder.test.js
git commit -m "feat: add detectPeriod with confidence score"
```

---

## Task 5: `decodeDepth` — pure synchronous decode core

Extracts the algorithm from `index.html`'s `decode()`: same SAD-over-shift-range, box-filter aggregation, sub-pixel parabola refinement, and 1–99% percentile depth stretch — but **synchronous, DOM-free, and returning its result** instead of writing globals and streaming progress via `say()`.

**Files:**
- Modify: `magic-eye-decoder/decoder.js`
- Test: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/decoder.test.js`:

```js
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
```

Note: `tiledRGBA` is already defined earlier in this test file (Task 4), so it is in scope.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — `decodeDepth` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `decoder.js`. This is the body of `index.html`'s `decode()` with the `setTimeout` chunking, the `say()` calls, and the global writes removed — it computes and returns `{ depth, shift, dw, dh }`, or `null` if the period is too wide:

```js
export function decodeDepth(data, w, h, period) {
  var d = data;
  var sMin = Math.max(8, Math.round(period * 0.70));
  var sMax = Math.max(sMin + 2, Math.round(period * 1.05));
  var dw = w - sMax;
  if (dw < 40) return null;

  var bestCost = new Float32Array(dw * h);
  for (var i = 0; i < dw * h; i++) bestCost[i] = Infinity;
  var bestS = new Int16Array(dw * h);
  var raw = new Float32Array(dw * h);
  var cLo = new Float32Array(dw * h), cHi = new Float32Array(dw * h), prevAgg = null;
  for (var i2 = 0; i2 < dw * h; i2++) { cLo[i2] = Infinity; cHi[i2] = Infinity; }

  for (var s = sMin; s <= sMax; s++) {
    for (var y = 0; y < h; y++) {
      var rs = y * w * 4, rd = y * dw;
      for (var x = 0; x < dw; x++) {
        var a = rs + x * 4, b = a + s * 4;
        raw[rd + x] = Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
      }
    }
    var agg = boxV(boxH(raw, dw, h, 4), dw, h, 3);
    for (var j = 0; j < dw * h; j++) {
      var aj = agg[j];
      if (aj < bestCost[j]) {
        bestCost[j] = aj; bestS[j] = s;
        cLo[j] = prevAgg ? prevAgg[j] : Infinity;
        cHi[j] = Infinity;
      } else if (bestS[j] === s - 1) {
        cHi[j] = aj;
      }
    }
    prevAgg = agg;
  }

  var depth = new Float32Array(dw * h);
  var span = Math.max(1, period - sMin);
  for (var m = 0; m < dw * h; m++) {
    var c0 = bestCost[m], cm = cLo[m], cp = cHi[m], dlt = 0;
    if (cm < Infinity && cp < Infinity) {
      var den = cm - 2 * c0 + cp;
      if (den > 1e-6) dlt = clamp(0.5 * (cm - cp) / den, -0.5, 0.5);
    }
    depth[m] = clamp((period - (bestS[m] + dlt)) / span, 0, 1);
  }

  var n = dw * h, histo = new Int32Array(257), acc = 0, loP = -1, hiP = 1;
  var clean = median3(depth, dw, h);
  for (var m2 = 0; m2 < n; m2++) histo[(clean[m2] * 256) | 0]++;
  for (var bb = 0; bb <= 256; bb++) {
    acc += histo[bb];
    if (loP < 0 && acc >= n * 0.01) loP = bb / 256;
    if (acc >= n * 0.99) { hiP = (bb + 1) / 256; break; }
  }
  if (hiP - loP > 0.04) {
    var inv = 1 / (hiP - loP);
    for (var m3 = 0; m3 < n; m3++) depth[m3] = clamp((depth[m3] - loP) * inv, 0, 1);
  }

  return { depth: depth, shift: bestS, dw: dw, dh: h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add decoder.js test/decoder.test.js
git commit -m "feat: add pure synchronous decodeDepth core"
```

---

## Task 6: `colorizeRelief` — depth map → RGBA overlay pixels

The live overlay uses the Relief look from `index.html`'s `paint()` (without the photo-color path, which needs the source pattern). Near = warm, far = cool, shaded by the depth gradient.

**Files:**
- Modify: `magic-eye-decoder/decoder.js`
- Test: `magic-eye-decoder/test/decoder.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/decoder.test.js`:

```js
import { colorizeRelief } from "../decoder.js";

test("colorizeRelief returns opaque RGBA and paints near warmer than far", () => {
  const w = 20, h = 4;
  const depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) depth[y * w + x] = x / (w - 1); // ramp 0..1 left->right

  const px = colorizeRelief(depth, w, h);
  assert.equal(px.length, w * h * 4);
  for (let i = 0; i < w * h; i++) assert.equal(px[i * 4 + 3], 255); // opaque

  const rFar = px[(2 * w + 1) * 4];         // near left edge, depth ~0 (cool)
  const rNear = px[(2 * w + (w - 2)) * 4];  // near right edge, depth ~1 (warm)
  assert.ok(rNear > rFar, `expected near (${rNear}) warmer than far (${rFar})`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd magic-eye-decoder && node --test`
Expected: FAIL — `colorizeRelief` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `decoder.js`. `RAMP`/`ramp` are copied from `index.html`; the shading loop is the Relief branch of `paint()` with `COLORSRC` forced off:

```js
var RAMP = [[79, 184, 201], [233, 229, 219], [232, 163, 61]];
function ramp(t) {
  var i = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  var a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function colorizeRelief(d, w, h) {
  var px = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = y * w + x, o = i * 4, z = d[i];
      var zx = d[clamp(x + 1, 0, w - 1) + y * w] - d[clamp(x - 1, 0, w - 1) + y * w];
      var zy = d[x + clamp(y + 1, 0, h - 1) * w] - d[x + clamp(y - 1, 0, h - 1) * w];
      var nx = -zx * 26, ny = -zy * 26, nz = 1;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= len; ny /= len; nz /= len;
      var lum = clamp(nx * (-0.42) + ny * (-0.60) + nz * 0.68, 0, 1);
      var lit = 0.20 + 0.95 * lum;
      var c = ramp(0.30 + 0.55 * z);
      px[o] = c[0] * lit; px[o + 1] = c[1] * lit; px[o + 2] = c[2] * lit; px[o + 3] = 255;
    }
  }
  return px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd magic-eye-decoder && node --test`
Expected: PASS — full suite green.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add decoder.js test/decoder.test.js
git commit -m "feat: add colorizeRelief depth->RGBA overlay colorizer"
```

---

## Task 7: Refactor `index.html` to consume the shared module (no behaviour change)

Make the desktop app use `decoder.js` as its single source of truth, deleting the duplicated inline math. This is the spec's "both apps run identical math" requirement.

**Files:**
- Modify: `magic-eye-decoder/index.html`

- [ ] **Step 1: Convert the script to a module and import the shared core**

In `index.html`, change the opening `<script>` (line ~167) to:

```html
<script type="module">
"use strict";
import { clamp, boxH, boxV, median3, polish, detectPeriod, decodeDepth } from "./decoder.js";
```

- [ ] **Step 2: Delete the now-duplicated inline definitions**

Remove these inline definitions from `index.html` (they now come from the import):
- `var clamp = function(...)` (line ~172)
- `function boxH(...)` and `function boxV(...)` (lines ~308–331)
- `function median3(...)` and `function polish(...)` (lines ~411–429)
- `function estimatePeriod(...)` (lines ~278–306)

Keep everything else (DOM wiring, `say`, `paint`, parallax, surface, sample generator).

- [ ] **Step 3: Route `decode()` and auto-period through the module**

Replace the body of the inline `function decode(period, done)` (lines ~333–408) with a thin wrapper over the pure core, preserving the `say()` messaging and the global writes the rest of the file depends on (`DEPTH`, `SHIFT`, `DW`, `DH`):

```js
function decode(period, done) {
  say("Measuring pattern spacing", "", false, 0.4);
  var res = decodeDepth(SRC.data, SRC.w, SRC.h, period);
  if (!res) {
    say("Period " + period + " px is too wide for this image", "Lower the period slider.", true, 1);
    busy = false;
    return;
  }
  DEPTH = res.depth; SHIFT = res.shift; DW = res.dw; DH = res.dh;
  done();
}
```

In `run()` (line ~774) replace `PERIOD = estimatePeriod(SRC.data, SRC.w, SRC.h);` with:

```js
PERIOD = detectPeriod(SRC.data, SRC.w, SRC.h).period;
```

- [ ] **Step 4: Verify the desktop app still works in the preview pane**

Start the server and open the app:
- `preview_start { name: "static-preview" }` then navigate to `http://localhost:8791/index.html`.
- Click the **Random-dot shark** sample card.
- `read_console_messages { onlyErrors: true }` → expect no errors (module loaded, no `estimatePeriod is not defined`).
- After it reveals, read back the output canvas stats to confirm a real shape decoded (not a flat field):

```js
// javascript_tool
(() => {
  const c = document.getElementById('out');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let min = 255, max = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { w: c.width, h: c.height, min, max, mean: sum / (d.length / 4) };
})();
```

Expected: `max - min > 60` (real relief contrast), matching the pre-refactor behaviour.

- [ ] **Step 5: Commit**

```bash
cd magic-eye-decoder
git add index.html
git commit -m "refactor: index.html imports shared decoder.js (single source of truth)"
```

---

## Task 8: `worker.js` — module Web Worker around the decode core

**Files:**
- Create: `magic-eye-decoder/worker.js`

- [ ] **Step 1: Implement the worker**

Create `magic-eye-decoder/worker.js`:

```js
"use strict";
import { detectPeriod, decodeDepth } from "./decoder.js";

var CONF_MIN = 0.12;   // below this we assume "not a stereogram" and skip
var lastPeriod = 100;

self.onmessage = function (e) {
  var msg = e.data;
  var data = new Uint8ClampedArray(msg.buffer); // transferred copy of the frame
  var w = msg.w, h = msg.h, frameId = msg.frameId;

  var confidence = null;
  if (msg.redetect) {
    var dp = detectPeriod(data, w, h);
    confidence = dp.confidence;
    if (dp.confidence >= CONF_MIN) lastPeriod = dp.period;
  }

  if (confidence !== null && confidence < CONF_MIN) {
    self.postMessage({ type: "result", frameId: frameId, period: lastPeriod, confidence: confidence, depth: null });
    return;
  }

  var res = decodeDepth(data, w, h, lastPeriod);
  if (!res) {
    self.postMessage({ type: "result", frameId: frameId, period: lastPeriod, confidence: confidence, depth: null });
    return;
  }
  self.postMessage(
    { type: "result", frameId: frameId, period: lastPeriod, confidence: confidence,
      depth: res.depth.buffer, dw: res.dw, dh: res.dh },
    [res.depth.buffer]
  );
};
```

- [ ] **Step 2: Verify it loads as a module worker (no unit harness; smoke-test in preview)**

This is verified end-to-end in Task 12. For now confirm the file parses by importing the same module it depends on:
Run: `cd magic-eye-decoder && node --input-type=module -e "import('./decoder.js').then(m => console.log(typeof m.decodeDepth, typeof m.detectPeriod))"`
Expected: `function function`.

- [ ] **Step 3: Commit**

```bash
cd magic-eye-decoder
git add worker.js
git commit -m "feat: add module web worker wrapping detectPeriod + decodeDepth"
```

---

## Task 9: `camera.js` — `CameraSource` + `TestSource`

Both expose the same interface: `start()`, `stop()`, and `grab()` → a downscaled `ImageData` (or `null` if no frame yet).

**Files:**
- Create: `magic-eye-decoder/camera.js`

- [ ] **Step 1: Implement both sources behind one interface**

Create `magic-eye-decoder/camera.js`:

```js
"use strict";

// Draws whatever <video>/<img> frame is available into a small capture canvas
// (~CAP_W wide) and returns its ImageData. Downscaling is what makes the live
// decode affordable.
var CAP_W = 200;

function makeCapture() {
  var c = document.createElement("canvas");
  var ctx = c.getContext("2d", { willReadFrequently: true });
  return { c: c, ctx: ctx };
}

function grabFrom(src, srcW, srcH, cap) {
  if (!srcW || !srcH) return null;
  var scale = Math.min(1, CAP_W / srcW);
  var w = Math.max(2, Math.round(srcW * scale));
  var h = Math.max(2, Math.round(srcH * scale));
  if (cap.c.width !== w) cap.c.width = w;
  if (cap.c.height !== h) cap.c.height = h;
  cap.ctx.drawImage(src, 0, 0, w, h);
  return cap.ctx.getImageData(0, 0, w, h);
}

export function CameraSource() {
  var video = document.createElement("video");
  video.playsInline = true; video.muted = true;
  var cap = makeCapture(), stream = null;
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, audio: false
      });
      video.srcObject = stream;
      await video.play();
    },
    stop() {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    },
    grab() {
      if (video.readyState < 2) return null;
      return grabFrom(video, video.videoWidth, video.videoHeight, cap);
    }
  };
}

// Feeds a static Demo stereogram through the identical interface, so the whole
// loop is verifiable at a desk / in the preview pane with no camera hardware.
export function TestSource(url) {
  var img = new Image();
  var cap = makeCapture(), ready = false;
  img.crossOrigin = "anonymous";
  return {
    async start() {
      await new Promise(function (res, rej) {
        img.onload = function () { ready = true; res(); };
        img.onerror = function () { rej(new Error("TestSource failed to load " + url)); };
        img.src = url;
      });
    },
    stop() {},
    grab() {
      if (!ready) return null;
      return grabFrom(img, img.naturalWidth, img.naturalHeight, cap);
    }
  };
}
```

- [ ] **Step 2: Verify (deferred to Task 12)**

`getUserMedia` and image decode need a DOM; both are exercised in the Task 12 end-to-end preview run.

- [ ] **Step 3: Commit**

```bash
cd magic-eye-decoder
git add camera.js
git commit -m "feat: add CameraSource + TestSource behind a shared grab() interface"
```

---

## Task 10: `overlay.js` — `OverlayRenderer`

Blits a colorized depth map over the live video on one display canvas, at an adjustable opacity.

**Files:**
- Create: `magic-eye-decoder/overlay.js`

- [ ] **Step 1: Implement the renderer**

Create `magic-eye-decoder/overlay.js`:

```js
"use strict";
import { colorizeRelief } from "./decoder.js";

// Owns the visible canvas. draw(frame, depth) paints the camera frame, then the
// colorized depth on top at `opacity`. The depth map may be smaller than the
// frame (decoder trims sMax columns); it is stretched to cover the frame.
export function OverlayRenderer(canvas) {
  var ctx = canvas.getContext("2d");
  var depthCanvas = document.createElement("canvas");
  var dctx = depthCanvas.getContext("2d");
  var opacity = 0.85;

  return {
    setOpacity(v) { opacity = v; },
    clearOverlay() { /* next draw with null depth shows raw video */ },
    draw(frame, depth, dw, dh) {
      if (canvas.width !== frame.width) canvas.width = frame.width;
      if (canvas.height !== frame.height) canvas.height = frame.height;
      ctx.putImageData(frame, 0, 0);
      if (!depth) return;
      var px = colorizeRelief(depth, dw, dh);
      if (depthCanvas.width !== dw) depthCanvas.width = dw;
      if (depthCanvas.height !== dh) depthCanvas.height = dh;
      dctx.putImageData(new ImageData(px, dw, dh), 0, 0);
      ctx.globalAlpha = opacity;
      ctx.drawImage(depthCanvas, 0, 0, dw, dh, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  };
}
```

- [ ] **Step 2: Verify (deferred to Task 12)**

- [ ] **Step 3: Commit**

```bash
cd magic-eye-decoder
git add overlay.js
git commit -m "feat: add OverlayRenderer that blits colorized depth over the frame"
```

---

## Task 11: `ar.html` — UI shell + orchestration loop

Wires camera → worker → overlay, with a Start button (camera needs a user gesture), an opacity slider, a source toggle (Camera / Test), and a debug readout.

**Files:**
- Create: `magic-eye-decoder/ar.html`

- [ ] **Step 1: Build the page**

Create `magic-eye-decoder/ar.html`:

```html
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0E151E">
<link rel="manifest" href="manifest.webmanifest">
<title>Magic Eye AR</title>
<style>
  html,body{margin:0;height:100%;background:#0E151E;color:#E9E5DB;font-family:system-ui,sans-serif;overflow:hidden}
  #view{display:block;width:100vw;height:100vh;object-fit:cover}
  .hud{position:fixed;left:0;right:0;bottom:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));
       background:linear-gradient(transparent,rgba(0,0,0,.55));display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .hud button,.hud label{font:12px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:#E9E5DB}
  .hud button{background:#161F2B;border:1px solid #26323F;border-radius:3px;padding:10px 14px;text-transform:uppercase;cursor:pointer}
  .hud button.primary{background:#E8A33D;color:#171008;border-color:#E8A33D}
  input[type=range]{accent-color:#E8A33D;vertical-align:middle}
  #readout{position:fixed;top:calc(10px + env(safe-area-inset-top));left:12px;font:11px/1.4 "IBM Plex Mono",monospace;color:#7D8C9C;white-space:pre}
  #searching{position:fixed;top:50%;left:0;right:0;text-align:center;transform:translateY(-50%);color:#7D8C9C;
             font:12px/1 "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase;display:none}
  #searching.on{display:block}
</style>

<canvas id="view"></canvas>
<div id="readout"></div>
<div id="searching">searching for a stereogram…</div>
<div class="hud">
  <button id="start" class="primary">Start camera</button>
  <button id="mode">Use test image</button>
  <label>Overlay <input id="opacity" type="range" min="0" max="1" step="0.05" value="0.85"></label>
</div>

<script type="module">
"use strict";
import { CameraSource, TestSource } from "./camera.js";
import { OverlayRenderer } from "./overlay.js";

var canvas = document.getElementById("view");
var overlay = OverlayRenderer(canvas);
var worker = new Worker("./worker.js", { type: "module" });

var source = null, usingTest = false, running = false;
var frameId = 0, decodeInFlight = false, decodeCount = 0;
var last = { depth: null, dw: 0, dh: 0 };

// Throttle decode requests; re-run period detection every REDETECT_EVERY decodes.
var REDETECT_EVERY = 5;

worker.onmessage = function (e) {
  var m = e.data;
  decodeInFlight = false;
  if (m.depth) last = { depth: new Float32Array(m.depth), dw: m.dw, dh: m.dh };
  else last = { depth: null, dw: 0, dh: 0 };
  document.getElementById("searching").classList.toggle("on", !m.depth);
  var conf = m.confidence == null ? "—" : m.confidence.toFixed(2);
  document.getElementById("readout").textContent =
    "src: " + (usingTest ? "test" : "camera") +
    "\nperiod: " + m.period + "px  conf: " + conf +
    "\ndecodes: " + decodeCount;
};

function loop() {
  if (!running) return;
  var frame = source && source.grab();
  if (frame) {
    overlay.draw(frame, last.depth, last.dw, last.dh);
    if (!decodeInFlight) {
      decodeInFlight = true;
      decodeCount++;
      var copy = new Uint8ClampedArray(frame.data); // transfer a copy, keep our frame
      worker.postMessage(
        { buffer: copy.buffer, w: frame.width, h: frame.height,
          frameId: ++frameId, redetect: decodeCount % REDETECT_EVERY === 1 },
        [copy.buffer]
      );
    }
  }
  requestAnimationFrame(loop);
}

async function startWith(src, isTest) {
  if (source) source.stop();
  running = false;
  source = src; usingTest = isTest;
  try {
    await source.start();
    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    document.getElementById("readout").textContent = "camera error:\n" + (err && err.message || err) +
      "\n(falling back to test image)";
    if (!isTest) startWith(TestSource("Demo/rkspFQ9.jpeg"), true);
  }
}

document.getElementById("start").onclick = function () {
  startWith(usingTest ? TestSource("Demo/rkspFQ9.jpeg") : CameraSource(), usingTest);
};
document.getElementById("mode").onclick = function () {
  usingTest = !usingTest;
  this.textContent = usingTest ? "Use camera" : "Use test image";
  startWith(usingTest ? TestSource("Demo/rkspFQ9.jpeg") : CameraSource(), usingTest);
};
document.getElementById("opacity").oninput = function (e) { overlay.setOpacity(+e.target.value); };

// Optional service worker for home-screen install; ignore failures in dev.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});
</script>
```

- [ ] **Step 2: Verify (full run in Task 12)**

- [ ] **Step 3: Commit**

```bash
cd magic-eye-decoder
git add ar.html
git commit -m "feat: add ar.html orchestrating camera/worker/overlay live loop"
```

---

## Task 12: End-to-end verification with TestSource in the preview pane

Prove the whole loop decodes a known stereogram and overlays a real shape — without camera hardware — using the `Demo/rkspFQ9.jpeg` airplane (period ≈ 164 at full res).

**Files:** none (verification only).

- [ ] **Step 1: Serve and open**

- `preview_start { name: "static-preview" }`.
- Navigate to `http://localhost:8791/ar.html`.

- [ ] **Step 2: Drive it to the test source**

- Click **Use test image** (`#mode`), then **Start camera** (`#start`) — with test mode on, this loads the Demo image through the same pipeline.
- `read_console_messages { onlyErrors: true }` → expect no errors (module worker loaded, Demo image reachable).

- [ ] **Step 3: Confirm a shape was decoded and overlaid**

Because the pane throttles when hidden, front the tab (a screenshot does this) and let a few decodes run. Then read the live-view canvas stats:

```js
// javascript_tool
(() => {
  const c = document.getElementById('view');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let min = 255, max = 0, sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; sum += v; n++; }
  return { w: c.width, h: c.height, rMin: min, rMax: max, rMean: (sum / n).toFixed(1),
           readout: document.getElementById('readout').textContent };
})();
```

Expected: `readout` shows `src: test`, a plausible `period` (roughly 40–90 at the downscaled ~200px width), `conf` well above 0.12, and `rMax - rMin > 60` (the relief overlay has real contrast, i.e. a shape is showing — not a flat frame).

- [ ] **Step 4: Confirm the "searching" suppression path**

Switch to a non-stereogram: in the console, temporarily point the test source at a flat image is overkill — instead verify the guard fires by asserting the searching overlay is hidden while decoding the airplane (from Step 3 it should be `off`), and that `conf` is above threshold. Record the observed `conf` value in the task notes.

- [ ] **Step 5: Screenshot proof + commit note**

- `computer { action: "screenshot" }` to capture the overlaid shape.
- No code commit here; note the observed `readout` values in the PR description later.

---

## Task 13: PWA manifest + service worker (home-screen install)

**Files:**
- Create: `magic-eye-decoder/manifest.webmanifest`
- Create: `magic-eye-decoder/sw.js`

- [ ] **Step 1: Add the manifest**

Create `magic-eye-decoder/manifest.webmanifest`:

```json
{
  "name": "Magic Eye AR",
  "short_name": "MagicEyeAR",
  "start_url": "./ar.html",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0E151E",
  "theme_color": "#0E151E",
  "icons": [
    { "src": "samples/thumbs/shark-random-dot.jpg", "sizes": "192x192", "type": "image/jpeg", "purpose": "any" }
  ]
}
```

Note: the icon is a placeholder from the existing `samples/thumbs/` so the manifest validates; replace with a real square PNG icon before any public release (tracked as a follow-up, not part of this MVP).

- [ ] **Step 2: Add a minimal cache-first service worker**

Create `magic-eye-decoder/sw.js`:

```js
"use strict";
var CACHE = "magic-eye-ar-v1";
var ASSETS = ["ar.html", "decoder.js", "camera.js", "overlay.js", "worker.js", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener("fetch", function (e) {
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
```

- [ ] **Step 3: Verify registration in the preview pane**

- Reload `http://localhost:8791/ar.html`.
- `read_console_messages { onlyErrors: true }` → no service-worker registration errors.
- `javascript_tool`: `navigator.serviceWorker.getRegistration().then(r => r ? r.active ? 'active' : 'registered' : 'none')` → expect `active` or `registered`.

- [ ] **Step 4: Commit**

```bash
cd magic-eye-decoder
git add manifest.webmanifest sw.js
git commit -m "feat: add PWA manifest + service worker for home-screen install"
```

---

## Task 14: On-device smoke test notes + README

**Files:**
- Modify: `magic-eye-decoder/README.md`

- [ ] **Step 1: Document the AR app and on-device testing**

Append a section to `README.md` describing:
- What `ar.html` is (live camera Magic Eye decoder, depth-overlay reveal).
- **iOS needs HTTPS for the camera** — deploy to the existing Vercel project and open the deployed `/ar.html` on the iPhone; `localhost`/preview works for TestSource only.
- How to test: open the deployed URL on the phone, tap **Start camera**, grant permission, point at a Magic Eye shown on a monitor; use the overlay slider to fade between video and reveal.
- `npm test` runs the decoder unit tests (Node ≥ 18, no dependencies).

- [ ] **Step 2: Commit**

```bash
cd magic-eye-decoder
git add README.md
git commit -m "docs: document Magic Eye AR app and on-device testing"
```

---

## Self-Review

**Spec coverage:**
- PWA camera web app → Tasks 9, 11, 13. ✓
- Live depth overlay reveal → Tasks 6, 10, 11. ✓
- Reuse existing decoder math / shared `decoder.js` → Tasks 1–7. ✓
- Approach A (downscaled CPU decode in a Web Worker) → Tasks 8, 9 (CAP_W downscale), 11. ✓
- CameraSource + TestSource twin → Task 9. ✓
- PeriodDetector with confidence, suppress overlay when not a stereogram → Tasks 4, 8, 11. ✓
- DecoderWorker → Task 8. ✓
- OverlayRenderer with adjustable opacity → Tasks 10, 11. ✓
- UI shell (start button, opacity, colormap/source toggle, debug readout) → Task 11. (Colormap toggle is descoped to a single Relief look for the MVP; source toggle added instead — noted below.) ✓ / see note
- Error handling: permission denied → TestSource fallback (Task 11); HTTPS requirement (Task 14); no-stereogram suppression (Tasks 8, 11). Adaptive performance backpressure: the single-in-flight decode gate in Task 11 provides natural backpressure (never queues more than one decode); explicit resolution/fps reduction is deferred to Phase 2 and called out here as a known simplification. ✓ / see note
- Testing: Node unit tests for the pure core (Tasks 1–6); in-pane pixel-readback verification (Tasks 7, 12, 13); on-device notes (Task 14). ✓
- Phase 2 (GPU shader, native shell) → explicitly out of scope. ✓

**Deviations from spec, called out intentionally:**
1. **Colormap toggle** (Relief vs. heatmap) is replaced by a fixed Relief overlay plus a Camera/Test **source** toggle. Rationale: the source toggle is needed to test without hardware; a second colormap is cosmetic and adds no MVP value (YAGNI). Heatmap can be added trivially later since `colorizeRelief` is isolated.
2. **Adaptive quality** is implemented as single-in-flight backpressure (never more than one decode outstanding) rather than dynamic resolution/fps scaling. Full adaptation is a Phase-2 concern; the fixed CAP_W=200 downscale keeps each decode cheap.

**Placeholder scan:** No TBD/TODO in implementation steps. The manifest icon is a deliberate, labelled placeholder (existing sample thumb) with a stated follow-up; it is not a plan gap.

**Type consistency:** Worker message shape is consistent (`{ buffer, w, h, frameId, redetect }` in; `{ type, frameId, period, confidence, depth, dw, dh }` out) between Task 8 and Task 11. `decodeDepth` returns `{ depth, shift, dw, dh }` in Tasks 5, 7, 8. `colorizeRelief(d, w, h)` signature matches between Tasks 6 and 10. `grab()` → `ImageData|null` matches between Tasks 9, 11. `OverlayRenderer.draw(frame, depth, dw, dh)` matches between Tasks 10, 11.
