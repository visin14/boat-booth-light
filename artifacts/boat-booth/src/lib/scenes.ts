// Scene background images, keyed by scene id — shared by create.tsx (shown
// while picking a scene) and the offline compositor (used as the backdrop
// the guest's cutout gets placed onto).
import bassImg from "@assets/bass_fishing.jpg_1780096222901.jpeg";
import boatCruisingImg from "@assets/boat_cruising.png";
import trophyCatchImg from "@assets/trophy_catch.png";
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
 * Where the *original* person already stands in each background photo, as
 * fractions of the image (0-1, left/top/right/bottom). The offline
 * compositor scales and positions the guest's cutout to cover this exact
 * region instead of a generic bottom-center placement, so the guest reads
 * as replacing that person rather than floating in front of them.
 *
 * Measured once (not at runtime) by running the same BodyPix segmentation
 * used for guest photos against each scene's background image, taking the
 * largest single connected blob of "person" pixels (not just the bounding
 * box of every pixel classified as "person") — a scene with more than one
 * person in frame would otherwise average into a box that doesn't tightly
 * match either one. Omit a scene here to fall back to generic bottom-center
 * placement.
 */
export const SCENE_SUBJECT_SLOTS: Record<string, { left: number; top: number; right: number; bottom: number }> = {
  "bass-fishing": { left: 0.4785, top: 0.2165, right: 0.5918, bottom: 0.5957 },
  "boat-cruising": { left: 0.2288, top: 0.3113, right: 0.5212, bottom: 0.9975 },
  "trophy-catch": { left: 0.2533, top: 0.1854, right: 0.7239, bottom: 0.9341 },
  "lake-camp": { left: 0.5029, top: 0.3031, right: 0.6904, bottom: 0.8878 },
  "dock-unwind": { left: 0.3514, top: 0.1815, right: 0.6486, bottom: 0.988 },
};
