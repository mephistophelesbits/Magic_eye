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
