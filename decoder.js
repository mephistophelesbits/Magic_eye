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
