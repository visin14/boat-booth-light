# Boat Booth

An interactive photo booth experience: pick a boat scene, snap a photo, and
get placed into it. Built with React, Vite, and Tailwind CSS v4.

Generation runs **entirely offline, client-side** — the booth runs at venues
with no internet connection. `artifacts/boat-booth/src/lib/offline-compositor.ts`
detects the guest's face with TensorFlow.js BlazeFace (model weights bundled
locally under `public/models/blazeface/`), aligns it to the face of the
person already in the chosen scene photo with a 2-point (eyes) similarity
transform, segments their actual head/hair silhouette with TensorFlow.js
BodyPix (weights under `public/models/bodypix/`) restricted to a region
around the detected face, and pastes that real cutout — not a guessed oval —
over theirs with a `<canvas>`. It's a face swap, not a full-body cutout, so
the rest of that person (body, pose, clothing, a dog, a boat) stays exactly
as shot, and because the cutout follows their actual hairline/jaw instead of
an ellipse approximation, it blends in cleanly without the halo or
background-color fringe an oval mask produces. No network request is made
anywhere in that pipeline, and no model weights are fetched from a CDN.
(Earlier versions: xAI's Grok Imagine API for a photorealistic AI blend,
which needed internet; a full-body BodyPix cutout-and-overlay, offline but
replacing the whole person; a BlazeFace-only face swap using an oval mask
instead of real segmentation for the cutout shape.)

## Project structure

```
.
├── artifacts/boat-booth/   # The app (Vite + React frontend)
├── attached_assets/        # Scene photos used by the app
└── pnpm-workspace.yaml     # Workspace + dependency catalog
```

`artifacts/boat-booth` is a pnpm workspace package with no backend service at
all — generation happens in the browser.

`artifacts/boat-booth/src/stub-api-client.tsx` is a local in-memory
implementation of the `@workspace/api-client-react` package (aliased in
`vite.config.ts`), standing in for scenes/stats/generation-history storage.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (the `preinstall` script enforces this)

## Setup

```bash
pnpm install
```

## Running

```bash
pnpm --filter @workspace/boat-booth run dev
```

The dev server prints both a `Local` and a `Network` URL — open the booth
screen via the **Network** address if guests on the same local Wi-Fi need to
reach it from their phones. No internet uplink is required for any of this;
only the local network.

## Notes

- `attached_assets/` holds the five scene photos (bass fishing, boat
  cruising, trophy catch, lake camp, dock unwind) referenced via the
  `@assets` Vite alias.
- `public/models/blazeface/` (~460KB) and `public/models/bodypix/` (~5.2MB,
  float weights) hold the detection and segmentation model weights,
  bundled into the build so the first photo doesn't fetch anything
  externally.
- `SCENE_FACE_LANDMARKS` in `lib/scenes.ts` is where each scene's own
  person's eyes and nose already are, measured once (not at runtime). Most
  came from running BlazeFace against the background photo itself; a few
  are plotted by hand instead because BlazeFace couldn't find (or couldn't
  confidently place) a face there — verify any new scene's landmarks by
  drawing the points back onto the photo before trusting them.
- The result screen's "scan to download" QR code only appears when a
  generation has a `downloadUrl` (i.e. a real backend hosting the photo at a
  short URL); since this offline build has none, guests instead get a
  "Download Photo" button that saves the composited image straight from the
  browser.
