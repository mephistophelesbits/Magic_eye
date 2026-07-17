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
