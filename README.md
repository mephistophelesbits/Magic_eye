# Magic Eye Decoder

A single-page tool that recovers the hidden 3D surface from an autostereogram (a "Magic Eye" picture) without needing to free-fuse it with your eyes.

Built for the roughly 5–10% of people who have reduced or absent binocular stereopsis and have never once seen the shape everyone else is pointing at.

No build step, no dependencies, no server. Open `index.html` and it runs.

**[Try it live →](https://magic-eye-steel.vercel.app/)**

![A camouflage-pattern autostereogram on the left; on the right, the airplane hidden inside it, recovered as an orbitable 3D model](screenshots/model-view.jpg)

*An off-the-shelf Magic Eye image (left) and the airplane it hides, recovered and rendered as a real 3D model you can drag to orbit (right).*

## How it works

An autostereogram is a wallpaper pattern that repeats every **P** pixels. Wherever the hidden surface sits closer to the viewer, the corresponding points are drawn slightly **closer together** than P. Your two eyes normally do that measurement. The pixels still carry it, so software can measure it instead.

1. **Estimate the period.** Slide the whole image against itself and score the mismatch at every shift from 20 to 320 px. The strongest dip is the pattern period. Integer multiples of the true period also dip, so the search walks down to the smallest shift that is both nearly as good and a genuinely sharp minimum relative to the image's baseline.

2. **Match every pixel.** For each pixel, search shifts `s` in `[0.70P, 1.05P]` for the one that best matches it to its neighbouring copy. Costs are summed over RGB and aggregated over a 9×7 window, because a single pixel in a field of noise is hopelessly ambiguous on its own.

3. **Read off the depth.** `depth = P − s`. Nearer means a tighter spacing means a bigger value. A parabola fitted through the matching cost at `s−1, s, s+1` refines each match to sub-pixel precision, so gradients come out smooth instead of terraced, and the depth range is stretched to the band the image actually uses (robust 1–99% cut) so the shape has contrast.

4. **Clean and render.** A 3×3 median kills the outliers, optional box passes smooth the surface, then it draws in one of five views: shaded **relief**, a **depth** ramp, **contour** bands, a **fused 3D** view (the poster's own pattern draped in depth with motion parallax — the closest a flat screen gets to what fused eyes see), or an orbitable WebGL **model** of the recovered surface. **Photo color** tints the relief and contour views with the poster's own local pattern colour, taken from a period-scale blur — the raw pixels are pattern noise and carry no object colour.

This is stereo matching where the left and right images happen to be the same picture. The rightmost strip (one search width) has no partner to match against and is trimmed.

Validated against a synthetic stereogram with a known depth map: the period locks exactly, and the recovered surface has a mean absolute depth error of 0.058 on a 0–1 scale.

## Using it

- **Drop, paste, or choose** an image. PNG and JPEG work; HEIC does not, because browsers can't decode it.
- **Pattern period** is auto-detected. If the output looks like noise, this is almost always why. Drag the slider slowly — the picture snaps into a solid shape within a pixel or two of the correct value.
- **Make a test stereogram** synthesises a real one with a known answer (a shark hidden in a blue water texture, like the classic poster), so you can watch the decoder pull it back out and confirm the thing works before trusting it on a real image.
- **Fused 3D** sways the viewpoint on its own and follows your mouse; **Model** is drag-to-orbit. Both respect the system reduce-motion setting.
- **Save** exports whatever view is showing as a PNG.

## Limitations

- Photos of posters must be shot square-on. Perspective skew misaligns the horizontal rows the whole method depends on.
- Wiggle stereograms, anaglyphs, and cross-eye stereo *pairs* are different formats and are not handled. This is for single-image autostereograms only.
- Very low-contrast or heavily JPEG-compressed sources give noisier depth maps.

## Sample images

The bundled sample stereograms in `samples/` come from Wikimedia Commons and keep their original licences:

- [Random-dot shark](https://commons.wikimedia.org/wiki/File:Stereogram_Tut_Random_Dot_Shark.png) and [textured shark](https://commons.wikimedia.org/wiki/File:Stereogram_Tut_Shark.png) by Fred Hsu — CC BY-SA 3.0
- [Sphere, cube and triangle](https://commons.wikimedia.org/wiki/File:Sphere_Cube_Triangle_3D_Stereogram_Illusion.png) by Gary W. Priester (eyeTricks 3D Stereograms) — CC BY-SA 4.0 (resized and recompressed here)

## Prior art

The generator used for the test image is the classic algorithm from Thimbleby, Inglis and Witten, *Displaying 3D Images: Algorithms for Single Image Random Dot Stereograms* (IEEE Computer, 1994). Recovering shape from a finished autostereogram has been studied properly by Ron Kimmel in *3D Shape Reconstruction from Autostereograms and Stereo* (Journal of Visual Communication and Image Representation, 2002); this implementation is a plain winner-take-all version of the same idea.

## Live AR overlay

`ar.html` is a second, camera-driven entry point: point your phone at a Magic Eye poster and it decodes depth live, frame by frame, and draws a relief overlay right over the video feed — no free-fusing required. It shares the same decoder core as `index.html`, downscaled and run in a Web Worker so the main thread stays smooth, with a period-detection gate that suppresses the overlay when the camera isn't looking at a stereogram.

It's also a minimal installable PWA (`manifest.webmanifest` + `sw.js`), so it can be added to a phone's home screen and opened like a native app.

**iOS requires HTTPS for camera access.** `localhost`/the preview server only work with the built-in test image (no real camera). To test on an iPhone, deploy to the existing Vercel project and open the deployed `/ar.html` URL on the phone — `getUserMedia` needs a secure context there.

To test on-device:
1. Open the deployed URL (e.g. `https://magic-eye-steel.vercel.app/ar.html`) on the phone.
2. Tap **Start camera** and grant camera permission.
3. Point the camera at a Magic Eye image shown on a monitor or in print.
4. Use the overlay slider to fade between the raw video and the decoded relief.

`npm test` runs the decoder's unit tests (Node ≥ 18, no dependencies) — the same pure core both entry points rely on.

## Licence

MIT.
