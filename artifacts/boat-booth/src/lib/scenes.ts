// Scene background images, keyed by scene id — shared by create.tsx (shown
// while picking a scene) and the offline compositor (used as the backdrop
// the guest's cutout gets placed onto).
import bassImg from "@assets/bass_fishing.jpg_1780096222901.jpeg";
import boatCruisingImg from "@assets/boat_cruising.png";
import trophyCatchImg from "@assets/trophy_catch_v2.jpg";
import lakeCampImg from "@assets/lake_camp.jpg";
import dockUnwindImg from "@assets/dock_unwind.jpg";

export const SCENE_IMAGES: Record<string, string> = {
  "bass-fishing": bassImg,
  "boat-cruising": boatCruisingImg,
  "trophy-catch": trophyCatchImg,
  "lake-camp": lakeCampImg,
  "dock-unwind": dockUnwindImg,
};

/**
 * Where the *original* person's eyes already are in each background photo,
 * as fractions (0-1) of the image (the "nose" point is kept but currently
 * unused — see solveSimilarity in offline-compositor.ts). The offline
 * compositor aligns the guest's detected eyes to these two points with a
 * similarity transform (scale + rotation, no shear) and pastes their face
 * over that person's — everything else about them (body, pose, the dog,
 * the boat) stays as shot.
 *
 * Measured once (not at runtime) by running the same BlazeFace detection
 * used on guest photos against each scene's background image — except
 * "bass-fishing", "boat-cruising" and "trophy-catch", where BlazeFace
 * couldn't find the face confidently enough to trust (too small in frame,
 * sunglasses, and a low-confidence offset detection, respectively), so
 * those three are plotted by hand instead, verified by drawing the points
 * back onto the photo.
 */
export const SCENE_FACE_LANDMARKS: Record<string, { leftEye: [number, number]; rightEye: [number, number]; nose: [number, number] }> = {
  "bass-fishing": { leftEye: [0.5469, 0.2594], rightEye: [0.5127, 0.2683], nose: [0.5303, 0.2953] },
  "boat-cruising": { leftEye: [0.4003, 0.3922], rightEye: [0.3431, 0.4044], nose: [0.3725, 0.4363] },
  "trophy-catch": { leftEye: [0.6992, 0.2435], rightEye: [0.6703, 0.2507], nose: [0.6836, 0.2794] },
  "lake-camp": { leftEye: [0.6151, 0.3358], rightEye: [0.57, 0.3489], nose: [0.5839, 0.3788] },
  "dock-unwind": { leftEye: [0.5377, 0.2392], rightEye: [0.4966, 0.2418], nose: [0.5204, 0.2708] },
};
