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
      video.srcObject = null;
    },
    grab() {
      if (video.readyState < 2) return null;
      return grabFrom(video, video.videoWidth, video.videoHeight, cap);
    },
    display() {
      if (video.readyState < 2) return null;
      return { el: video, w: video.videoWidth, h: video.videoHeight };
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
    },
    display() {
      if (!ready) return null;
      return { el: img, w: img.naturalWidth, h: img.naturalHeight };
    }
  };
}
