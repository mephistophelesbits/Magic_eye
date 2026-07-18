"use strict";

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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
