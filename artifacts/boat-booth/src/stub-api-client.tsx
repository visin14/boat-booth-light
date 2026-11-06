// Local stand-in for the missing "@workspace/api-client-react" workspace
// package (not present in this copied project). Simulates the backend
// in-memory so the UI can be previewed end to end without a real server.
// Aliased in vite.config.ts — remove the alias once the real package/backend
// is available again.
//
// Generation itself (useCreateGeneration below) runs the offline compositor
// (src/lib/offline-compositor.ts) entirely client-side — the booth runs at
// venues with no internet connection, so there's no server call here at all,
// unlike the earlier xAI-backed version.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { generateOfflinePhoto } from "@/lib/offline-compositor";
import { SCENE_IMAGES, SCENE_FACE_LANDMARKS } from "@/lib/scenes";

export interface Scene {
  id: string;
  name: string;
  tagline: string;
  description: string;
}

export type GenerationStatus = "idle" | "pending" | "ready" | "failed";

export interface Generation {
  id: string;
  sceneId: string;
  sceneName: string;
  photoStatus: GenerationStatus;
  photoUrl: string | null;
  /** Short, scannable URL a phone can fetch the full-res photo from. */
  downloadUrl?: string;
  error?: string;
}

const SCENES: Scene[] = [
  {
    id: "bass-fishing",
    name: "Bass Fishing",
    tagline: "Reel in the big one",
    description: "Cast a line from the bow at sunrise.",
  },
  {
    id: "boat-cruising",
    name: "Boat Cruising",
    tagline: "Captain your own crew",
    description: "Take the wheel for a calm autumn cruise across the lake.",
  },
  {
    id: "trophy-catch",
    name: "Trophy Catch",
    tagline: "Reel in the one that didn't get away",
    description: "Fight the big one right up to the boat.",
  },
  {
    id: "lake-camp",
    name: "Lake Camp",
    tagline: "Dockside glamping with your trophy catch",
    description: "Kneel under the tent flap with your catch and your dog at golden hour.",
  },
  {
    id: "dock-unwind",
    name: "Dock Unwind",
    tagline: "Kick back, lake side",
    description: "Settle into an Adirondack chair on the dock as the sun sets.",
  },
];

const generations = new Map<string, Generation>();
let nextId = 1;

function queryClientNotify(queryClient: ReturnType<typeof useQueryClient>, key: unknown[]) {
  queryClient.invalidateQueries({ queryKey: key });
}

export function getGetGenerationQueryKey(id: string) {
  return ["generation", id];
}

export function getListGenerationsQueryKey(params: { limit?: number } = {}) {
  return ["generations", params];
}

export function getGetBoothStatsQueryKey() {
  return ["boothStats"];
}

export function useListScenes() {
  return useQuery({
    queryKey: ["scenes"],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return SCENES;
    },
  });
}

export function useCreateGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { sceneId: string; photoBase64: string } }) => {
      const id = String(nextId++);
      const scene = SCENES.find((s) => s.id === data.sceneId);
      const generation: Generation = {
        id,
        sceneId: data.sceneId,
        sceneName: scene?.name ?? "Boat Day",
        photoStatus: "pending",
        photoUrl: null,
      };
      generations.set(id, generation);

      const notify = () => {
        queryClientNotify(queryClient, getGetGenerationQueryKey(id));
        queryClientNotify(queryClient, ["generations"]);
        queryClientNotify(queryClient, getGetBoothStatsQueryKey());
      };

      // Offline, client-side only: detect the guest's face in their photo and
      // paste it over the face of the person already in the scene's
      // background image (offline-compositor.ts). No network request — fire
      // and forget here, useGetGeneration's polling picks up the result.
      // downloadUrl is left unset; the result screen falls back to
      // downloading photoUrl (a data: URL) directly.
      (async () => {
        try {
          const sceneImageUrl = SCENE_IMAGES[data.sceneId];
          const sceneFaceLandmarks = SCENE_FACE_LANDMARKS[data.sceneId];
          if (!sceneImageUrl || !sceneFaceLandmarks) throw new Error(`Unknown scene "${data.sceneId}".`);
          const photoUrl = await generateOfflinePhoto(data.photoBase64, sceneImageUrl, sceneFaceLandmarks);

          const g = generations.get(id);
          if (!g) return;
          generations.set(id, { ...g, photoStatus: "ready", photoUrl });
        } catch (err) {
          const g = generations.get(id);
          if (!g) return;
          generations.set(id, {
            ...g,
            photoStatus: "failed",
            error: err instanceof Error ? err.message : "Generation failed",
          });
        } finally {
          notify();
        }
      })();

      return generation;
    },
  });
}

export function useGetGeneration(
  id: string,
  options?: { query?: Partial<UseQueryOptions<Generation | null>> },
) {
  return useQuery({
    queryKey: getGetGenerationQueryKey(id),
    queryFn: async () => generations.get(id) ?? null,
    enabled: !!id,
    ...options?.query,
  });
}

export function useListGenerations(
  params: { limit?: number } = {},
  options?: { query?: Partial<UseQueryOptions<Generation[]>> },
) {
  return useQuery({
    queryKey: getListGenerationsQueryKey(params),
    queryFn: async () => {
      const all = Array.from(generations.values()).reverse();
      return params.limit ? all.slice(0, params.limit) : all;
    },
    ...options?.query,
  });
}

export function useGetBoothStats(options?: {
  query?: Partial<UseQueryOptions<{ totalCreations: number }>>;
}) {
  return useQuery({
    queryKey: getGetBoothStatsQueryKey(),
    queryFn: async () => {
      const all = Array.from(generations.values());
      return {
        totalCreations: all.filter((g) => g.photoStatus === "ready").length,
      };
    },
    ...options?.query,
  });
}
