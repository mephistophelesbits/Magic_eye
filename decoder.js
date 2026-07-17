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
