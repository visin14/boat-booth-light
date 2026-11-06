// Fully offline "put the guest's face on the water" pipeline — no network
// call of any kind. The booth site runs at venues with no internet
// connection. This detects the guest's face (TensorFlow.js BlazeFace, model
// weights bundled under public/models/blazeface so nothing is fetched from
// a CDN) for alignment, segments their actual head/hair silhouette
// (TensorFlow.js BodyPix, weights bundled under public/models/bodypix) for
// the cutout shape itself — not a guessed oval — aligns it to the face of
// the person already in the chosen scene photo with a 2-point similarity
// transform, and pastes it over theirs. The rest of that person (body,
// pose, clothing, the dog, the boat) stays exactly as shot.
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import * as blazeface from "@tensorflow-models/blazeface";
import * as bodyPix from "@tensorflow-models/body-pix";

const FACE_MODEL_URL = `${import.meta.env.BASE_URL}models/blazeface/model.json`;
const SEGMENTER_MODEL_URL = `${import.meta.env.BASE_URL}models/bodypix/model.json`;

let facePromise: Promise<blazeface.BlazeFaceModel> | null = null;
let segmenterPromise: Promise<bodyPix.BodyPix> | null = null;

async function ensureBackend(): Promise<void> {
  try {
    await tf.setBackend("webgl");
  } catch {
    await tf.setBackend("cpu");
  }
  await tf.ready();
}

/** Loads (once) and caches the BlazeFace detection model from the bundled local weights. */
function loadFaceDetector(): Promise<blazeface.BlazeFaceModel> {
  if (!facePromise) {
    facePromise = (async () => {
      await ensureBackend();
      // Lower than the 0.75 default — a guest isn't always looking
      // dead-on at the booth camera (kids moving, a group photo, someone
      // mid-laugh), and a missed detection means a "please retake" prompt
      // rather than a safe fallback, so it's worth trading a bit of
      // false-positive risk for fewer false "no face found" rejections.
      return blazeface.load({ modelUrl: FACE_MODEL_URL, maxFaces: 1, scoreThreshold: 0.5 });
    })();
  }
  return facePromise;
}

/** Loads (once) and caches the BodyPix segmentation model from the bundled local weights. */
function loadSegmenter(): Promise<bodyPix.BodyPix> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      await ensureBackend();
      return bodyPix.load({
        architecture: "MobileNetV1",
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 4,
        modelUrl: SEGMENTER_MODEL_URL,
      });
    })();
  }
  return segmenterPromise;
}

/** Warms up both models in the background so the first real capture doesn't eat the load time. */
export function preloadSegmenter(): void {
  void loadFaceDetector();
  void loadSegmenter();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

type Point = [number, number];

/** The three landmarks (in absolute pixel coordinates) a face alignment is built from. */
interface FacePoints {
  rightEye: Point;
  leftEye: Point;
  nose: Point;
}

/** A detected face's alignment points plus its overall box, in the pixel space of the image it was detected on. */
interface DetectedFace extends FacePoints {
  topLeft: Point;
  bottomRight: Point;
}

/**
 * Runs BlazeFace on `canvas` and returns the most confident face's key
 * points. The underlying WebGL backend is occasionally flaky across
 * repeated inferences on different-sized inputs in one long-lived session
 * — a kiosk processing many guests back to back is exactly that pattern —
 * so this retries once before concluding the photo itself has no
 * detectable face.
 */
async function detectFace(canvas: HTMLCanvasElement): Promise<DetectedFace> {
  const net = await loadFaceDetector();
  const ATTEMPTS = 2;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    // The 4th param ("annotateBoxes") must be true or BlazeFace omits
    // landmarks/probability from its predictions entirely.
    const predictions = await net.estimateFaces(canvas, false, false, true);
    if (predictions.length > 0) {
      const face = predictions[0];
      const landmarks = face.landmarks as unknown as Point[];
      // BlazeFace's documented keypoint order: rightEye, leftEye, nose, mouth, rightEar, leftEar.
      return {
        rightEye: landmarks[0],
        leftEye: landmarks[1],
        nose: landmarks[2],
        topLeft: face.topLeft as unknown as Point,
        bottomRight: face.bottomRight as unknown as Point,
      };
    }
    if (attempt === ATTEMPTS) {
      throw new Error("Couldn't find a face in that photo — make sure your whole face is in frame and well lit.");
    }
  }
  throw new Error("Couldn't find a face in that photo — make sure your whole face is in frame and well lit.");
}

/**
 * Solves for the 2x3 affine matrix [a, b, c, d, e, f] (Canvas
 * `setTransform` order) for a *similarity* transform (uniform scale +
 * rotation + translation, no shear or independent per-axis stretch) that
 * maps `srcEyeLine` onto `dstEyeLine`. Deliberately not a general 3-point
 * affine: that's exact at 3 control points but can extrapolate into wild
 * shear/scale everywhere else (forehead, chin) when those points are
 * noisy — a real problem for scenes where the person's face was only
 * detected at low confidence. A 2-point eye-line similarity transform is
 * the standard, more robust technique for face alignment — scale comes
 * from the (well-conditioned) eye-to-eye distance ratio, rotation from the
 * eye-line angle, and nothing else can distort independently.
 */
function solveSimilarity(
  srcEyeLine: [Point, Point],
  dstEyeLine: [Point, Point],
): [number, number, number, number, number, number] {
  const [srcLeft, srcRight] = srcEyeLine;
  const [dstLeft, dstRight] = dstEyeLine;

  const srcDx = srcRight[0] - srcLeft[0];
  const srcDy = srcRight[1] - srcLeft[1];
  const srcDist = Math.hypot(srcDx, srcDy);
  const dstDx = dstRight[0] - dstLeft[0];
  const dstDy = dstRight[1] - dstLeft[1];
  const dstDist = Math.hypot(dstDx, dstDy);
  if (srcDist < 1e-3 || dstDist < 1e-3) {
    throw new Error("Face alignment points are degenerate (eyes coincide).");
  }

  const scale = dstDist / srcDist;
  const rotation = Math.atan2(dstDy, dstDx) - Math.atan2(srcDy, srcDx);
  const cos = Math.cos(rotation) * scale;
  const sin = Math.sin(rotation) * scale;

  // Rotation-scale 2x2 [[cos,-sin],[sin,cos]], then solve the translation
  // that sends srcLeft exactly onto dstLeft.
  const a = cos;
  const b = sin;
  const c = -sin;
  const d = cos;
  const e = dstLeft[0] - (a * srcLeft[0] + c * srcLeft[1]);
  const f = dstLeft[1] - (b * srcLeft[0] + d * srcLeft[1]);

  return [a, b, c, d, e, f];
}

/**
 * Builds a transparent-outside-the-head cutout of the guest's photo: the
 * original pixels wherever BodyPix calls them "person" *and* that pixel
 * falls inside a generous region of interest around the detected face —
 * nothing outside either. Using real segmentation instead of a guessed
 * oval means the cutout follows the guest's actual hairline, ears and jaw
 * rather than approximating them with an ellipse, which is what caused the
 * visible halo/gap artifacts in earlier versions of this pipeline: no
 * matter how an oval's size and feather were tuned, it either bled into
 * the guest's own background or left a gap showing it, because it simply
 * didn't match their head's real shape.
 */
async function cutoutFace(guestCanvas: HTMLCanvasElement, face: DetectedFace): Promise<HTMLCanvasElement> {
  const net = await loadSegmenter();

  const [bx0, by0] = face.topLeft;
  const [bx1, by1] = face.bottomRight;
  const boxW = bx1 - bx0;
  const boxH = by1 - by0;
  const centerX = (bx0 + bx1) / 2;
  const centerY = by0 + boxH * 0.4;

  // Region of interest around the head — wide/tall enough to reliably
  // include hair and ears, but stopping at the jaw/chin rather than
  // reaching down into the neck, collar and shoulders: those are the
  // guest's own clothing, which otherwise gets pasted on top of whatever
  // the scene's own person is wearing there and shows up as a mismatched
  // collar/color underneath the face.
  const roiX0 = Math.max(0, Math.floor(centerX - boxW * 1.2));
  const roiX1 = Math.min(guestCanvas.width, Math.ceil(centerX + boxW * 1.2));
  const roiY0 = Math.max(0, Math.floor(by0 - boxH * 0.9));
  const roiY1 = Math.min(guestCanvas.height, Math.ceil(by0 + boxH * 1.05));

  // The WebGL backend is occasionally flaky across repeated inferences in
  // one long-lived session (see the retry note on detectFace above) —
  // retry once if the ROI comes back suspiciously empty of "person"
  // before concluding the photo itself is the problem.
  const SEGMENT_ATTEMPTS = 2;
  let segmentation: Awaited<ReturnType<typeof net.segmentPerson>> | null = null;
  for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS; attempt++) {
    const seg = await net.segmentPerson(guestCanvas, { internalResolution: "full", segmentationThreshold: 0.6 });
    let personPixels = 0;
    let totalPixels = 0;
    for (let y = roiY0; y < roiY1; y++) {
      for (let x = roiX0; x < roiX1; x++) {
        totalPixels++;
        if (seg.data[y * seg.width + x] === 1) personPixels++;
      }
    }
    if (personPixels / Math.max(1, totalPixels) >= 0.08 || attempt === SEGMENT_ATTEMPTS) {
      segmentation = seg;
      break;
    }
  }
  if (!segmentation) throw new Error("Couldn't find a face in that photo — make sure your whole face is in frame and well lit.");

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = guestCanvas.width;
  maskCanvas.height = guestCanvas.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Canvas 2D context unavailable");
  const maskImageData = maskCtx.createImageData(guestCanvas.width, guestCanvas.height);
  const segW = segmentation.width;
  for (let y = roiY0; y < roiY1; y++) {
    for (let x = roiX0; x < roiX1; x++) {
      if (segmentation.data[y * segW + x] !== 1) continue;
      const idx = (y * guestCanvas.width + x) * 4;
      maskImageData.data[idx] = 255;
      maskImageData.data[idx + 1] = 255;
      maskImageData.data[idx + 2] = 255;
      maskImageData.data[idx + 3] = 255;
    }
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // Light feather only — the mask already follows the real silhouette, so
  // this is just anti-aliasing the per-pixel segmentation edge, not
  // papering over a shape mismatch the way the old oval's wide blur had to.
  const featherPx = Math.max(1, Math.round(Math.min(boxW, boxH) * 0.04));
  const blurredMaskCanvas = document.createElement("canvas");
  blurredMaskCanvas.width = maskCanvas.width;
  blurredMaskCanvas.height = maskCanvas.height;
  const blurredMaskCtx = blurredMaskCanvas.getContext("2d");
  if (!blurredMaskCtx) throw new Error("Canvas 2D context unavailable");
  blurredMaskCtx.filter = `blur(${featherPx}px)`;
  blurredMaskCtx.drawImage(maskCanvas, 0, 0);

  const cutoutCanvas = document.createElement("canvas");
  cutoutCanvas.width = guestCanvas.width;
  cutoutCanvas.height = guestCanvas.height;
  const cutoutCtx = cutoutCanvas.getContext("2d");
  if (!cutoutCtx) throw new Error("Canvas 2D context unavailable");
  cutoutCtx.drawImage(guestCanvas, 0, 0);
  cutoutCtx.globalCompositeOperation = "destination-in";
  cutoutCtx.drawImage(blurredMaskCanvas, 0, 0);
  cutoutCtx.globalCompositeOperation = "source-over";

  return cutoutCanvas;
}

/** Draws `src` (an image or canvas) onto a `w`x`h` canvas context, covering it (crop-to-fill, like CSS `object-fit: cover`). */
function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, srcW: number, srcH: number, w: number, h: number) {
  const scale = Math.max(w / srcW, h / srcH);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
}

/** Average RGB over a rectangular region of `canvas`, in its own pixel coordinates. */
function averageColor(canvas: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): [number, number, number] {
  const cx0 = Math.max(0, Math.floor(x0));
  const cy0 = Math.max(0, Math.floor(y0));
  const cx1 = Math.min(canvas.width, Math.ceil(x1));
  const cy1 = Math.min(canvas.height, Math.ceil(y1));
  const ctx = canvas.getContext("2d");
  if (!ctx || cx1 <= cx0 || cy1 <= cy0) return [128, 128, 128];
  const { data } = ctx.getImageData(cx0, cy0, cx1 - cx0, cy1 - cy0);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  // Sample every 3rd pixel in each dimension — plenty for an average, and
  // much cheaper than reading every pixel of a high-res photo.
  const step = 3;
  for (let i = 0; i < data.length; i += 4 * step) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return [128, 128, 128];
  return [r / count, g / count, b / count];
}

/**
 * Nudges `canvas`'s RGB (in place, alpha untouched) toward `targetColor`,
 * blended at `strength` (0 = no change, 1 = fully matched) — a cheap
 * per-channel gain correction, not real color science, but enough to stop
 * a face lit indoors from reading as obviously pasted onto a golden-hour
 * lake photo. Only non-transparent pixels are touched.
 */
function nudgeColorToward(canvas: HTMLCanvasElement, sourceColor: [number, number, number], targetColor: [number, number, number], strength: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const gain: [number, number, number] = [0, 1, 2].map((i) => {
    const raw = targetColor[i] / Math.max(1, sourceColor[i]);
    const clamped = Math.min(1.5, Math.max(0.7, raw));
    return 1 + (clamped - 1) * strength;
  }) as [number, number, number];

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.min(255, data[i] * gain[0]);
    data[i + 1] = Math.min(255, data[i + 1] * gain[1]);
    data[i + 2] = Math.min(255, data[i + 2] * gain[2]);
  }
  ctx.putImageData(imageData, 0, 0);
}

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 900;

export interface SceneFaceLandmarks {
  leftEye: Point;
  rightEye: Point;
  nose: Point;
}

/**
 * The whole offline pipeline: detect the guest's face in their captured
 * photo, align and paste it over the face of the person already in the
 * chosen scene photo (everything else about that person — body, pose, the
 * dog, the boat — stays as shot). Returns a JPEG data URL — never touches
 * the network.
 *
 * `sceneFaceLandmarks` is where that scene's own person's eyes and nose
 * are, as fractions (0-1) of the scene image (see SCENE_FACE_LANDMARKS in
 * lib/scenes.ts) — measured once, not at runtime.
 */
export async function generateOfflinePhoto(
  photoBase64: string,
  sceneImageUrl: string,
  sceneFaceLandmarks: SceneFaceLandmarks,
): Promise<string> {
  const [guestImg, sceneImg] = await Promise.all([loadImage(photoBase64), loadImage(sceneImageUrl)]);

  const guestCanvas = document.createElement("canvas");
  guestCanvas.width = guestImg.naturalWidth;
  guestCanvas.height = guestImg.naturalHeight;
  const guestCtx = guestCanvas.getContext("2d");
  if (!guestCtx) throw new Error("Canvas 2D context unavailable");
  guestCtx.drawImage(guestImg, 0, 0);

  const guestFace = await detectFace(guestCanvas);
  const faceCutout = await cutoutFace(guestCanvas, guestFace);

  const sceneW = sceneImg.naturalWidth;
  const sceneH = sceneImg.naturalHeight;
  const sceneFace: FacePoints = {
    leftEye: [sceneFaceLandmarks.leftEye[0] * sceneW, sceneFaceLandmarks.leftEye[1] * sceneH],
    rightEye: [sceneFaceLandmarks.rightEye[0] * sceneW, sceneFaceLandmarks.rightEye[1] * sceneH],
    nose: [sceneFaceLandmarks.nose[0] * sceneW, sceneFaceLandmarks.nose[1] * sceneH],
  };

  const matrix = solveSimilarity(
    [guestFace.rightEye, guestFace.leftEye],
    [sceneFace.rightEye, sceneFace.leftEye],
  );

  // Composite in the scene's own native resolution first — warping the
  // guest's face into that coordinate space — then cover-fit the whole
  // result to the output size in one pass at the end.
  const composedCanvas = document.createElement("canvas");
  composedCanvas.width = sceneW;
  composedCanvas.height = sceneH;
  const composedCtx = composedCanvas.getContext("2d");
  if (!composedCtx) throw new Error("Canvas 2D context unavailable");
  composedCtx.drawImage(sceneImg, 0, 0, sceneW, sceneH);

  // Nudge the cutout's color toward the scene's own lighting at the exact
  // spot the face is about to land, before pasting it — otherwise a face
  // lit by indoor light (or a different time of day) stands out against a
  // golden-hour lake no matter how clean the cutout's edges are. Sampled
  // from the composed canvas's background *before* the face is drawn, so
  // this reads the scene's ambient color, not anything already pasted.
  const [fx0, fy0] = guestFace.topLeft;
  const [fx1, fy1] = guestFace.bottomRight;
  const destCorners: Point[] = [
    [fx0, fy0],
    [fx1, fy0],
    [fx0, fy1],
    [fx1, fy1],
  ].map(([x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]);
  const destXs = destCorners.map((p) => p[0]);
  const destYs = destCorners.map((p) => p[1]);
  const targetColor = averageColor(composedCanvas, Math.min(...destXs), Math.min(...destYs), Math.max(...destXs), Math.max(...destYs));
  const sourceColor = averageColor(guestCanvas, fx0, fy0, fx1, fy1);
  // Blended at 55% strength — enough to visibly tie the face into the
  // scene's warmth/brightness without pushing skin tones somewhere wrong
  // when the two photos' lighting is very different.
  nudgeColorToward(faceCutout, sourceColor, targetColor, 0.55);

  composedCtx.imageSmoothingEnabled = true;
  composedCtx.imageSmoothingQuality = "high";
  composedCtx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  composedCtx.drawImage(faceCutout, 0, 0);
  composedCtx.setTransform(1, 0, 0, 1, 0, 0);

  const out = document.createElement("canvas");
  out.width = OUTPUT_WIDTH;
  out.height = OUTPUT_HEIGHT;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D context unavailable");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  drawCover(outCtx, composedCanvas, sceneW, sceneH, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  return out.toDataURL("image/jpeg", 0.92);
}
