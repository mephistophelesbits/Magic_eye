# Magic Eye AR — Live Overlay PWA

**Date:** 2026-07-17
**Status:** Approved design, ready for implementation planning

## Summary

A mobile PWA that turns an iPhone into a live Magic Eye decoder: point the
camera at an autostereogram and the hidden 3D shape is revealed as a live
depth overlay composited on top of the video feed. Version 1 targets a
stereogram shown **on another screen** (monitor/tablet), which is also the
easiest configuration to iterate on from a desk.

The app reuses the existing decoding math. The current single-file app at
`magic-eye-decoder/index.html` runs a per-pixel SAD stereo-matching pipeline
(shift search over 0.70–1.05×period, box-filter cost aggregation, sub-pixel
parabola refinement, robust 1–99% percentile depth stretch). That pipeline is
extracted into a shared module and reused verbatim.

## Goals

- Point the phone camera at a Magic Eye and see the hidden shape appear in real
  time as a shaded relief / depth heatmap over the live video.
- Reuse the existing decoder math — no algorithmic rewrite for the MVP.
- Installable to the iPhone home screen, runs fullscreen (feels like an app).
- Iterable at a desk without a physical printout.

## Non-goals (explicitly out of MVP scope)

- Tilt-parallax reveal, orbitable 3D mesh, or freeze-and-decode modes (live
  depth overlay only).
- True world-anchored ARKit (mesh pinned to the page in 3D space).
- Native iOS app / App Store distribution.
- GPU-shader decoder (deferred to Phase 2 for framerate).
- Robustness to heavy glare / steep perspective skew (deferred; screen target
  first).

## Chosen approach

**PWA camera web app**, because the existing code is JS/WebGL and iOS Safari
supports `getUserMedia`, WebGL, and `deviceorientation`. This reuses ~90% of
the current code and keeps the fast browser-based iteration loop.

**Decoder strategy: Approach A first (walking skeleton), then Approach C.**
- **A (MVP):** downscaled CPU decoder running the existing pipeline in a Web
  Worker. Updates ~4–8 fps; reuses trusted code; lowest effort.
- **C (Phase 2):** period detection stays on CPU, heavy per-pixel matching moves
  to a WebGL fragment shader for true 30–60 fps.

Nothing from Phase A is thrown away when moving to C.

## Architecture

Standalone PWA:
- `magic-eye-decoder/ar.html` — the AR app page/UI.
- `magic-eye-decoder/decoder.js` — **shared decoder module extracted from
  `index.html`** so the desktop app and the AR app run identical math. This is a
  targeted refactor: lift the decode functions into a module and have both pages
  import it. No behavior change to the desktop app.
- `magic-eye-decoder/manifest.json` — PWA manifest (name, icons, `display:
  standalone`, portrait orientation).
- `magic-eye-decoder/sw.js` — minimal service worker for home-screen install /
  offline shell.

## Components

Each component has one purpose and a defined interface, and is testable in
isolation.

### CameraSource
- Opens `getUserMedia({ video: { facingMode: 'environment' } })` into a hidden
  `<video>`; draws each frame to a small capture canvas (~160px wide,
  aspect-preserved).
- Interface: `getFrame() -> ImageData` (downscaled grayscale-capable buffer),
  plus `start()` / `stop()`.
- **TestSource** twin: same interface, but feeds a static Demo image (e.g.
  `Demo/rkspFQ9.jpeg`) instead of the camera. Lets the entire loop run at a desk
  / in the browser pane without a real camera.

### PeriodDetector
- Autocorrelation over a few averaged horizontal scanlines of the downscaled
  frame → dominant repetition period + a confidence score (peak strength).
- Runs a few times per second (not every frame).
- Interface: `detect(frame) -> { period: number, confidence: number }`.

### DecoderWorker
- Web Worker wrapping the shared `decoder.js` pipeline (SAD → sub-pixel →
  depth-stretch) run on the downscaled frame at the given period.
- Interface (postMessage): `decode(frame, period) -> depthMap` (Float32 or
  Uint8 typed array + dimensions).

### OverlayRenderer
- Colorizes the depth map (relief shading or heatmap) and composites it over the
  live video at adjustable opacity, sized to the viewport.
- Reuses the last depth map between decodes so the video stays smooth while the
  worker computes the next frame.

### UI shell (`ar.html`)
- Start-camera button (required user gesture to open the camera).
- Overlay opacity slider.
- Colormap toggle (relief vs. heatmap).
- Small debug readout: fps, detected period, confidence.

## Data flow

```
video frame
  → downscale (CameraSource, ~160px wide)
  → [every ~5th frame] PeriodDetector → { period, confidence }
  → DecoderWorker(frame, period) → depthMap        (async, off UI thread)
  → OverlayRenderer(depthMap) → composite over live video
```

The worker keeps the UI thread free; the overlay reuses the last depth map
between decode results so the displayed video never stalls.

## Error handling / edge cases

- **Camera permission denied / no camera** → clear on-screen message; in dev,
  auto-fall back to TestSource.
- **iOS requires HTTPS (secure context) for the camera** → on-device testing
  runs against the Vercel deploy. `localhost` (browser pane / TestSource loop)
  works for desk iteration.
- **Not pointing at a stereogram** → PeriodDetector confidence below a threshold
  ⇒ render *no* overlay ("searching…") rather than garbage from a bogus period.
- **Performance backpressure** → adaptive quality: if decode frames back up,
  automatically reduce decode resolution and/or decode fps.

## Testing

- **Desk / headless:** TestSource + known-good `Demo/rkspFQ9.jpeg` drives the
  full loop (capture → period → decode → overlay). Verify with in-page pixel
  statistics, **not timing** — per the known browser-pane gotcha (rAF/setTimeout
  throttle when the pane is hidden; transcribing canvas base64 corrupts it).
- **Component tests:** PeriodDetector against Demo images with known periods
  (e.g. airplane period ≈ 164 at full res, scaled to the downscaled width);
  DecoderWorker output compared against the desktop app's depth map on the same
  input.
- **On device:** deploy to Vercel, open on the iPhone, point at a stereogram
  shown in a second browser tab / on a monitor.

## Phase 2 (future, not this plan)

- Move DecoderWorker core into a WebGL fragment shader (Approach C) for
  30–60 fps.
- Optional native shell (Capacitor/WKWebView) for App Store distribution and
  world-anchored ARKit reveal.
