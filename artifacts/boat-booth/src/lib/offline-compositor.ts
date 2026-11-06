// Fully offline "put the guest on the water" pipeline — no network call of
// any kind. The booth site runs at venues with no internet connection, so
// the earlier xAI Grok Imagine integration (api/generate-photo.js) can't be
// reached there; this replaces it with client-side person segmentation
// (TensorFlow.js BodyPix, model weights bundled under public/models/bodypix
// so nothing is fetched from a CDN) plus a canvas composite onto the chosen
// scene's background photo. It's a straight cutout-and-overlay, not a
// photorealistic AI blend — that trade-off is the point: it works with the
// power cord and nothing else.
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import * as bodyPix from "@tensorflow-models/body-pix";

const MODEL_URL = `${import.meta.env.BASE_URL}models/bodypix/model.json`;

let netPromise: Promise<bodyPix.BodyPix> | null = null;

/** Loads (once) and caches the BodyPix segmentation model from the bundled local weights. */
function loadSegmenter(): Promise<bodyPix.BodyPix> {
  if (!netPromise) {
    netPromise = (async () => {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      return bodyPix.load({
        architecture: "MobileNetV1",
        outputStride: 16,
        multiplier: 0.75,
        // Float weights (not quantized) — noticeably cleaner mask edges than
        // the smaller quant2 model; worth the extra ~2.6MB since this is a
        // one-time local load, not a network fetch.
        quantBytes: 4,
        modelUrl: MODEL_URL,
      });
    })();
  }
  return netPromise;
}

/** Warms up the model in the background so the first real capture doesn't eat the load time. */
export function preloadSegmenter(): void {
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

/**
 * Segments the person out of `photoDataUrl` and returns a canvas containing
 * just them, transparent elsewhere, with softened (blurred-mask) edges
 * instead of a hard, jagged cutout line.
 */
async function cutoutPerson(photoDataUrl: string): Promise<HTMLCanvasElement> {
  const net = await loadSegmenter();
  const img = await loadImage(photoDataUrl);

  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = img.naturalWidth;
  photoCanvas.height = img.naturalHeight;
  const photoCtx = photoCanvas.getContext("2d");
  if (!photoCtx) throw new Error("Canvas 2D context unavailable");
  photoCtx.drawImage(img, 0, 0);

  // The underlying WebGL backend is occasionally flaky across repeated
  // inferences on different-sized inputs in one long-lived session — a
  // kiosk processing many guests back to back is exactly that pattern —
  // and can return a near-empty mask on an otherwise perfectly good photo.
  // Retry once with a fresh inference before concluding the photo itself
  // is the problem, so a guest doesn't get an unnecessary "retake" prompt
  // over a transient hiccup.
  const SEGMENT_ATTEMPTS = 2;
  let minX = 0;
  let minY = 0;
  let maxX = -1;
  let maxY = -1;
  let personPixels = 0;
  let segmentation: Awaited<ReturnType<typeof net.segmentPerson>> | null = null;

  for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS; attempt++) {
    segmentation = await net.segmentPerson(photoCanvas, {
      // "full" gives a noticeably less blocky mask boundary than the default
      // "medium" — this runs once per photo, not per frame, so the extra cost
      // is a worthwhile trade for not looking pixelated once cropped and
      // scaled up to fill the frame.
      internalResolution: "full",
      // Slightly below the 0.7 default so more of the body (not just skin
      // tones) counts as "person" — clothing in low light was getting missed
      // and the bounding box below ended up head-only.
      segmentationThreshold: 0.6,
    });

    // Bounding box of the segmented person, in segmentation-mask pixel space
    // (same resolution as the source photo). Needed below to crop the cutout
    // down to just them — without this, compositing scales the *whole*
    // mostly-transparent source frame to fill the output, leaving the person
    // tiny and wherever they happened to stand in the original shot.
    minX = segmentation.width;
    minY = segmentation.height;
    maxX = -1;
    maxY = -1;
    personPixels = 0;
    for (let y = 0; y < segmentation.height; y++) {
      for (let x = 0; x < segmentation.width; x++) {
        if (segmentation.data[y * segmentation.width + x] !== 1) continue;
        personPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    const bboxHeightFrac = maxY >= minY ? (maxY - minY) / segmentation.height : 0;
    const personAreaFrac = personPixels / (segmentation.width * segmentation.height);
    const looksValid = maxX >= minX && maxY >= minY && bboxHeightFrac >= 0.25 && personAreaFrac >= 0.03;
    if (looksValid || attempt === SEGMENT_ATTEMPTS) break;
  }
  if (!segmentation) throw new Error("Segmentation model unavailable.");

  // A guest standing in front of the booth camera should dominate the
  // frame — a sliver of "person" pixels (a stray hand, a reflection, model
  // noise, or a leftover flaky inference even after the retry above) crops
  // down to something unrecognizable once blown up to fill the result. Fail
  // clearly here instead of silently compositing that, so the guest sees
  // the existing "something went wrong, retake" screen rather than a
  // broken-looking photo.
  const bboxHeightFrac = maxY >= minY ? (maxY - minY) / segmentation.height : 0;
  const personAreaFrac = personPixels / (segmentation.width * segmentation.height);
  if (maxX < minX || maxY < minY || bboxHeightFrac < 0.25 || personAreaFrac < 0.03) {
    throw new Error("Couldn't get a clear view of you in that photo — try stepping back so your head and shoulders are fully in frame.");
  }

  // Opaque-white-on-transparent mask, one pixel per source pixel.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = segmentation.width;
  maskCanvas.height = segmentation.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Canvas 2D context unavailable");
  const maskImageData = maskCtx.createImageData(segmentation.width, segmentation.height);
  for (let i = 0; i < segmentation.data.length; i++) {
    const isPerson = segmentation.data[i] === 1;
    const offset = i * 4;
    maskImageData.data[offset] = 255;
    maskImageData.data[offset + 1] = 255;
    maskImageData.data[offset + 2] = 255;
    maskImageData.data[offset + 3] = isPerson ? 255 : 0;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // Blur radius as a fraction of the *person's* bounding box (not the full
  // photo) — generateOfflinePhoto later scales the crop to a fixed output
  // height regardless of source resolution, so tying the feather to a
  // fraction of the crop means it ends up roughly the same apparent size in
  // the final image whether the capture was 480p or 1080p, instead of
  // turning into a huge blur blob when a small capture gets scaled way up.
  const bboxSize = Math.max(maxX - minX, maxY - minY, 1);
  const featherPx = Math.min(6, Math.max(1, Math.round(bboxSize * 0.006)));

  // Blur the mask (not the photo) to turn the hard per-pixel edge into a
  // soft feather, then use it as an alpha stencil over the original photo.
  const blurredMaskCanvas = document.createElement("canvas");
  blurredMaskCanvas.width = maskCanvas.width;
  blurredMaskCanvas.height = maskCanvas.height;
  const blurredMaskCtx = blurredMaskCanvas.getContext("2d");
  if (!blurredMaskCtx) throw new Error("Canvas 2D context unavailable");
  blurredMaskCtx.filter = `blur(${featherPx}px)`;
  blurredMaskCtx.drawImage(maskCanvas, 0, 0);

  const fullCutoutCanvas = document.createElement("canvas");
  fullCutoutCanvas.width = photoCanvas.width;
  fullCutoutCanvas.height = photoCanvas.height;
  const fullCutoutCtx = fullCutoutCanvas.getContext("2d");
  if (!fullCutoutCtx) throw new Error("Canvas 2D context unavailable");
  fullCutoutCtx.drawImage(photoCanvas, 0, 0);
  fullCutoutCtx.globalCompositeOperation = "destination-in";
  fullCutoutCtx.drawImage(blurredMaskCanvas, 0, 0);
  fullCutoutCtx.globalCompositeOperation = "source-over";

  // Crop down to just the person (plus a little breathing room), so
  // compositing scales *them* to fill the output frame instead of the whole
  // mostly-transparent source photo.
  const pad = Math.round(0.05 * bboxSize);
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(segmentation.width, maxX + pad) - cropX;
  const cropH = Math.min(segmentation.height, maxY + pad) - cropY;

  const cutoutCanvas = document.createElement("canvas");
  cutoutCanvas.width = cropW;
  cutoutCanvas.height = cropH;
  const cutoutCtx = cutoutCanvas.getContext("2d");
  if (!cutoutCtx) throw new Error("Canvas 2D context unavailable");
  cutoutCtx.imageSmoothingEnabled = true;
  cutoutCtx.imageSmoothingQuality = "high";
  cutoutCtx.drawImage(fullCutoutCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return cutoutCanvas;
}

/** The source crop window `drawCover` below reads from `img` — covering a `w`x`h` canvas, like CSS `object-fit: cover`. */
function coverCropWindow(img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  return { sx, sy, sw, sh };
}

/** Draws `img` onto a `w`x`h` canvas context, covering it (crop-to-fill, like CSS `object-fit: cover`). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const { sx, sy, sw, sh } = coverCropWindow(img, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

/**
 * Maps a point given as a fraction (0-1) of the *original* scene image into
 * pixel coordinates on the `w`x`h` output canvas, accounting for the crop
 * `drawCover` applied to fit the image's aspect ratio to the output's.
 */
function mapImageFractionToOutput(
  fracX: number,
  fracY: number,
  img: HTMLImageElement,
  crop: { sx: number; sy: number; sw: number; sh: number },
  w: number,
  h: number,
) {
  const origX = fracX * img.naturalWidth;
  const origY = fracY * img.naturalHeight;
  return { x: ((origX - crop.sx) / crop.sw) * w, y: ((origY - crop.sy) / crop.sh) * h };
}

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 900;

export interface SceneSubjectSlot {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The whole offline pipeline: segment the guest out of their captured photo
 * and composite them onto the chosen scene's background image. Returns a
 * JPEG data URL — never touches the network.
 *
 * `subjectSlot`, when given, is where the *original* person already stands
 * in the background photo (see SCENE_SUBJECT_SLOTS in lib/scenes.ts) — the
 * guest's cutout is scaled and positioned to cover that region instead of a
 * generic bottom-center placement, so they read as replacing that person
 * rather than floating in front of them.
 */
export async function generateOfflinePhoto(
  photoBase64: string,
  sceneImageUrl: string,
  subjectSlot?: SceneSubjectSlot,
): Promise<string> {
  const [cutout, sceneImg] = await Promise.all([cutoutPerson(photoBase64), loadImage(sceneImageUrl)]);

  const out = document.createElement("canvas");
  out.width = OUTPUT_WIDTH;
  out.height = OUTPUT_HEIGHT;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const crop = coverCropWindow(sceneImg, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  drawCover(ctx, sceneImg, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  if (subjectSlot) {
    const topLeft = mapImageFractionToOutput(subjectSlot.left, subjectSlot.top, sceneImg, crop, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const bottomRight = mapImageFractionToOutput(subjectSlot.right, subjectSlot.bottom, sceneImg, crop, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const slotCenterX = (topLeft.x + bottomRight.x) / 2;
    const slotBottom = bottomRight.y;
    const slotHeight = bottomRight.y - topLeft.y;

    // Overscan the original subject's box a bit — the guest's own
    // proportions won't match the original person's exactly, and this is
    // meant to fully cover them, not just match their bounding box.
    const OVERSCAN = 1.3;
    const MAX_UPSCALE = 2.2;
    const personScale = Math.min(MAX_UPSCALE, (slotHeight * OVERSCAN) / cutout.height);
    const drawW = cutout.width * personScale;
    const drawH = cutout.height * personScale;
    const drawX = slotCenterX - drawW / 2;
    const drawY = slotBottom - drawH;
    ctx.drawImage(cutout, drawX, drawY, drawW, drawH);

    return out.toDataURL("image/jpeg", 0.92);
  }

  // No known subject slot for this scene (e.g. a distant group shot) —
  // place the cutout filling most of the frame height, bottom-anchored and
  // centered — reads like they're standing in the scene rather than pasted
  // in a corner. Capped so a low-resolution capture doesn't get blown up
  // into a visibly soft, blurry cutout — better to show them a bit smaller
  // than to upscale a small crop past where it still looks sharp.
  const MAX_UPSCALE = 2.2;
  const personScale = Math.min(MAX_UPSCALE, (OUTPUT_HEIGHT * 0.92) / cutout.height);
  const drawW = cutout.width * personScale;
  const drawH = cutout.height * personScale;
  const drawX = (OUTPUT_WIDTH - drawW) / 2;
  const drawY = OUTPUT_HEIGHT - drawH;
  ctx.drawImage(cutout, drawX, drawY, drawW, drawH);

  return out.toDataURL("image/jpeg", 0.92);
}
