// Fully offline "put the guest's face on the water" pipeline — no network
// call of any kind. The booth site runs at venues with no internet
// connection. This detects the guest's face (TensorFlow.js BlazeFace, model
// weights bundled under public/models/blazeface so nothing is fetched from
// a CDN), aligns it to the face of the person already in the chosen scene
// photo using a 3-point affine warp (eyes + nose), and pastes it over
// theirs — a face swap, not a full-body cutout. The rest of that person
// (body, pose, clothing, the dog, the boat) stays exactly as shot.
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import * as blazeface from "@tensorflow-models/blazeface";

const MODEL_URL = `${import.meta.env.BASE_URL}models/blazeface/model.json`;

let netPromise: Promise<blazeface.BlazeFaceModel> | null = null;

/** Loads (once) and caches the BlazeFace detection model from the bundled local weights. */
function loadFaceDetector(): Promise<blazeface.BlazeFaceModel> {
  if (!netPromise) {
    netPromise = (async () => {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      // Lower than the 0.75 default — a guest isn't always looking
      // dead-on at the booth camera (kids moving, a group photo, someone
      // mid-laugh), and a missed detection means a "please retake" prompt
      // rather than a safe fallback, so it's worth trading a bit of
      // false-positive risk for fewer false "no face found" rejections.
      return blazeface.load({ modelUrl: MODEL_URL, maxFaces: 1, scoreThreshold: 0.5 });
    })();
  }
  return netPromise;
}

/** Warms up the model in the background so the first real capture doesn't eat the load time. */
export function preloadSegmenter(): void {
  void loadFaceDetector();
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
 * Builds a transparent-outside-the-face cutout of the guest's photo: the
 * original pixels inside a soft-edged oval around their detected face,
 * nothing outside it. The oval is sized relative to the eye/nose geometry
 * (not just BlazeFace's tight face box) so it comfortably covers forehead,
 * chin and ears once pasted over someone else's face.
 */
function cutoutFace(guestCanvas: HTMLCanvasElement, face: DetectedFace): HTMLCanvasElement {
  const [bx0, by0] = face.topLeft;
  const [bx1, by1] = face.bottomRight;
  const boxW = bx1 - bx0;
  const boxH = by1 - by0;
  const centerX = (bx0 + bx1) / 2;
  // BlazeFace's box is tight around eyes/nose/mouth — bias the oval's
  // center up and extend it to reach the chin below and the
  // forehead/hair above. Sized generously enough to reliably clear the
  // hairline even on a guest with more hair volume — too tight and a gap
  // opens up at the top where *their own* background shows through inside
  // the oval instead (a differently-colored patch, just as visible as the
  // halo it was meant to avoid). The soft, wide feather below is what
  // actually keeps a bit of background-color leak at the true edge from
  // reading as a hard ring, not a tight radius.
  const centerY = by0 + boxH * 0.4;
  const radiusX = boxW * 0.7;
  const radiusY = boxH * 0.95;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = guestCanvas.width;
  maskCanvas.height = guestCanvas.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Canvas 2D context unavailable");
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  maskCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  maskCtx.fill();

  // Feather the oval edge so the paste doesn't look like a sticker — blur
  // radius scales with the face size so it reads the same whether the
  // capture was low- or high-resolution. Wide on purpose: a simple oval
  // can't match an actual head's silhouette exactly, so *some* of the
  // guest's own background inevitably ends up right at the true edge —
  // a wide, soft gradient there fades that out gradually instead of
  // showing it as a sharp, differently-colored ring.
  const featherPx = Math.max(3, Math.round(Math.min(radiusX, radiusY) * 0.22));
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
  const faceCutout = cutoutFace(guestCanvas, guestFace);

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
