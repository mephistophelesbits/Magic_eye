"use strict";
import { colorizeRelief } from "./decoder.js";

// Owns the visible canvas. draw(display, depth) paints the full-resolution
// display source (video/img element), then the colorized depth on top at
// `opacity`. The depth map may be smaller than the display source (decoder
// trims sMax columns and works off a downscaled decode frame); it is
// stretched to cover the canvas.
export function OverlayRenderer(canvas) {
  var ctx = canvas.getContext("2d");
  var depthCanvas = document.createElement("canvas");
  var dctx = depthCanvas.getContext("2d");
  var opacity = 0.85;

  return {
    setOpacity(v) { opacity = v; },
    draw(display, depth, dw, dh) {
      var scale = Math.min(1, 1280 / display.w);
      var cw = Math.round(display.w * scale), ch = Math.round(display.h * scale);
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      ctx.drawImage(display.el, 0, 0, cw, ch);
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
