# Boat Booth

An interactive photo booth experience: pick a boat scene, snap a photo, and
get placed into it. Built with React, Vite, and Tailwind CSS v4.

Generation runs **entirely offline, client-side** — the booth runs at venues
with no internet connection. `artifacts/boat-booth/src/lib/offline-compositor.ts`
detects the guest's face with TensorFlow.js BlazeFace (model weights bundled
locally under `public/models/blazeface/`, not fetched from a CDN), aligns it
to the face of the person already in the chosen scene photo with a 2-point
(eyes) similarity transform, and pastes it over theirs with a `<canvas>` — a
face swap, not a full-body cutout, so the rest of that person (body, pose,
clothing, a dog, a boat) stays exactly as shot. No network request is made
anywhere in that pipeline. (Two earlier versions existed: calling xAI's Grok
Imagine API for a photorealistic AI blend, which needed internet; then a
full-body cutout-and-overlay using TensorFlow.js BodyPix, offline but
replacing the whole person instead of just their face.)

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
- `public/models/blazeface/` holds the BlazeFace detection model weights
  (~460KB), bundled into the build so the first photo doesn't fetch anything
  externally.
- `SCENE_FACE_LANDMARKS` in `lib/scenes.ts` is where each scene's own
  person's eyes and nose already are, measured once (not at runtime). Most
  came from running BlazeFace against the background photo itself; two
  (`bass-fishing`, `boat-cruising`) are plotted by hand because BlazeFace
  couldn't find a face there at all (too small in frame, and sunglasses,
  respectively) even at a near-zero confidence threshold.
- The result screen's "scan to download" QR code only appears when a
  generation has a `downloadUrl` (i.e. a real backend hosting the photo at a
  short URL); since this offline build has none, guests instead get a
  "Download Photo" button that saves the composited image straight from the
  browser.
