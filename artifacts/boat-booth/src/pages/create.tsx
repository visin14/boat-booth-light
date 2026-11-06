import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListScenes,
  useCreateGeneration,
  useGetGeneration,
  getGetGenerationQueryKey,
  Scene,
} from "@workspace/api-client-react";
import QRCode from "qrcode";
import { BlinkingDotsScene } from "@/components/BlinkingDotsScene";
import { Camera, ChevronLeft, RefreshCcw, Download, ArrowRight, Loader2, QrCode } from "lucide-react";
import { SCENE_IMAGES } from "@/lib/scenes";
import { preloadSegmenter } from "@/lib/offline-compositor";

const SCENE_META: Record<string, { tag: string; tagBg: string; shadow: string }> = {
  "bass-fishing": { tag: "chill mode", tagBg: "#FF7AD9", shadow: "var(--bb-lime)" },
  "boat-cruising": { tag: "smooth sailing", tagBg: "#8EDCFF", shadow: "#FF7AD9" },
  "trophy-catch": { tag: "the big one", tagBg: "var(--bb-lime)", shadow: "#8B5CFF" },
  "lake-camp": { tag: "cozy vibes", tagBg: "#FFD23F", shadow: "#8B5CFF" },
  "dock-unwind": { tag: "golden hour", tagBg: "#FF6B4A", shadow: "#FFD23F" },
};
const FALLBACK_META = { tag: "pick me", tagBg: "#FFD23F", shadow: "#3FC6FF" };

type Step = "scene" | "capture" | "processing" | "result";

export default function Create() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("scene");
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);

  const { data: scenes, isLoading: loadingScenes } = useListScenes();
  const createGeneration = useCreateGeneration();

  // Warm up the offline segmentation model while the guest is still picking
  // a scene, so it's already loaded by the time they hit "looks good!".
  useEffect(() => {
    preloadSegmenter();
  }, []);

  const { data: generation } = useGetGeneration(generationId || "", {
    query: {
      queryKey: getGetGenerationQueryKey(generationId || ""),
      enabled: !!generationId,
      refetchInterval: (query) => {
        if (!query.state.data) return 3000;
        return query.state.data.photoStatus === "pending" ? 3000 : false;
      },
    },
  });

  // Flow handlers
  const handleSceneSelect = (scene: Scene) => {
    setSelectedScene(scene);
    setStep("capture");
  };

  const handleCapture = (base64: string) => {
    setPhotoBase64(base64);
  };

  const handleSubmit = async () => {
    if (!selectedScene || !photoBase64) return;
    setStep("processing");
    try {
      const res = await createGeneration.mutateAsync({
        data: { sceneId: selectedScene.id, photoBase64 },
      });
      setGenerationId(res.id);
    } catch (err) {
      console.error(err);
      // Handle error
    }
  };

  useEffect(() => {
    if (step === "processing" && generation?.photoStatus === "ready") {
      setStep("result");
    }
  }, [generation?.photoStatus, step]);

  const reset = () => {
    setLocation("/");
  };

  const downloadFile = useCallback(async (url: string, baseName: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "bin").replace("jpeg", "jpg");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${baseName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <div
      className="bb-root min-h-[100dvh] w-full overflow-hidden relative"
      style={{ "--bb-lime": "#C8F53A", color: "#061A2E", background: "#F2FBFF" } as React.CSSProperties}
    >
      {/* Header */}
      <header className="absolute top-0 w-full p-6 z-50 flex items-center justify-between">
        <button
          onClick={reset}
          className="bb-press bb-mono inline-flex items-center gap-2 rounded-full"
          style={{ padding: "10px 20px", background: "#FFFFFF", border: "2px solid #061A2E", boxShadow: "3px 3px 0 #061A2E", fontSize: 14 }}
        >
          <ChevronLeft className="w-4 h-4" /> start over
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 pt-28 pb-16 max-w-7xl mx-auto w-full relative">
        {step === "scene" && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-8">
            <div className="text-center mb-12">
              <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(36px, 6vw, 72px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
                choose your{" "}
                <span className="inline-block rounded-[0.2em]" style={{ padding: "0 0.15em", background: "var(--bb-lime)", transform: "rotate(-2deg)" }}>
                  experience
                </span>
              </h2>
              <p className="bb-mono mt-4" style={{ fontSize: 15, color: "#3A5670" }}>
                select the vibe you want to capture today.
              </p>
            </div>

            {loadingScenes ? (
              <div className="flex justify-center p-20">
                <Loader2 className="w-12 h-12 animate-spin" style={{ color: "#FF6B4A" }} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                {scenes?.map((scene) => {
                  const meta = SCENE_META[scene.id] ?? FALLBACK_META;
                  return (
                    <button
                      key={scene.id}
                      onClick={() => handleSceneSelect(scene)}
                      className="bb-tilt group text-left flex flex-col overflow-hidden rounded-[28px] bg-white"
                      style={{ border: "3px solid #061A2E", boxShadow: `8px 8px 0 ${meta.shadow}` }}
                    >
                      <div className="relative h-[300px] w-full overflow-hidden">
                        <img
                          src={SCENE_IMAGES[scene.id]}
                          alt={scene.name}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
                        <span
                          className="bb-mono absolute rounded-full"
                          style={{ left: 16, top: 16, fontSize: 12, padding: "6px 12px", background: meta.tagBg, border: "2px solid #061A2E", transform: "rotate(-4deg)" }}
                        >
                          {meta.tag}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2" style={{ padding: "22px 24px 26px" }}>
                        <h3 className="m-0 font-extrabold lowercase" style={{ fontSize: 28, letterSpacing: "-0.03em" }}>
                          {scene.name}
                        </h3>
                        <p className="m-0" style={{ fontSize: 16, color: "#3A5670" }}>
                          {scene.tagline}
                        </p>
                        {scene.description && (
                          <p className="m-0" style={{ fontSize: 13, color: "#7F98AF" }}>
                            {scene.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "capture" && (
          <div className="w-full max-w-4xl mx-auto animate-in fade-in zoom-in-95">
            <div className="text-center mb-8">
              <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
                strike a pose
              </h2>
              <p className="bb-mono mt-3" style={{ fontSize: 15, color: "#3A5670" }}>
                look at the camera and smile.
              </p>
            </div>

            <div className="rounded-[28px] bg-white p-4" style={{ border: "3px solid #061A2E", boxShadow: "8px 8px 0 #3FC6FF" }}>
              <WebcamCapture photoBase64={photoBase64} onCapture={handleCapture} />
            </div>

            {photoBase64 && (
              <div className="mt-8 flex justify-center gap-4">
                <button
                  onClick={() => setPhotoBase64(null)}
                  className="bb-press inline-flex items-center gap-2 rounded-full font-extrabold"
                  style={{ padding: "16px 28px", background: "#FFFFFF", color: "#061A2E", fontSize: 17, border: "3px solid #061A2E", boxShadow: "5px 5px 0 #061A2E" }}
                >
                  <RefreshCcw className="w-5 h-5" /> retake
                </button>
                <button
                  onClick={handleSubmit}
                  className="bb-press inline-flex items-center gap-2 rounded-full font-extrabold"
                  style={{ padding: "16px 32px", background: "var(--bb-lime)", color: "#061A2E", fontSize: 17, border: "3px solid #061A2E", boxShadow: "5px 5px 0 #FF6B4A" }}
                >
                  looks good! <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {step === "processing" && generation?.photoStatus === "failed" && (
          <div className="flex flex-col items-center justify-center text-center animate-in fade-in duration-500 gap-6 max-w-lg">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 80, height: 80, background: "#FFE1D6", border: "3px solid #061A2E" }}
            >
              <Camera className="w-10 h-10" style={{ color: "#E0482A" }} />
            </div>
            <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: 36, letterSpacing: "-0.03em" }}>
              something went wrong
            </h2>
            <p className="m-0 break-words" style={{ fontSize: 17, color: "#3A5670" }}>
              {generation.error || "We couldn't generate your photo."}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setStep("capture")}
                className="bb-press inline-flex items-center gap-2 rounded-full font-extrabold"
                style={{ padding: "14px 26px", background: "#FFFFFF", color: "#061A2E", fontSize: 16, border: "3px solid #061A2E", boxShadow: "4px 4px 0 #061A2E" }}
              >
                <RefreshCcw className="w-4 h-4" /> retake photo
              </button>
              <button
                onClick={handleSubmit}
                className="bb-press rounded-full font-extrabold"
                style={{ padding: "14px 26px", background: "var(--bb-lime)", color: "#061A2E", fontSize: 16, border: "3px solid #061A2E", boxShadow: "4px 4px 0 #FF6B4A" }}
              >
                try again
              </button>
            </div>
          </div>
        )}

        {step === "processing" && generation?.photoStatus !== "failed" && (
          <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center animate-in fade-in duration-500 gap-8">
            <div
              className="relative w-full aspect-[4/3] rounded-[28px] overflow-hidden"
              style={{ border: "3px solid #061A2E", boxShadow: "8px 8px 0 var(--bb-lime)", color: "#061A2E" }}
            >
              <BlinkingDotsScene />
            </div>
            <div>
              <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: 36, letterSpacing: "-0.03em" }}>
                creating magic&hellip;
              </h2>
              <p className="bb-mono mt-2 max-w-md" style={{ fontSize: 14, color: "#3A5670" }}>
                our AI is putting you on the water. this takes just a moment.
              </p>
            </div>
          </div>
        )}

        {step === "result" && generation?.photoUrl && (
          <div className="w-full max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div
                className="relative aspect-[4/3] overflow-hidden rounded-[28px]"
                style={{ border: "3px solid #061A2E", boxShadow: "10px 10px 0 #FF6B4A" }}
              >
                <img src={generation.photoUrl} alt="Your creation" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col gap-8">
                <div>
                  <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
                    wow, look at you!
                  </h2>
                  <p className="m-0 mt-3" style={{ fontSize: 20, color: "#3A5670" }}>
                    your {generation.sceneName} experience looks incredible.
                  </p>
                </div>

                <div className="flex flex-wrap items-start gap-6">
                  {generation.downloadUrl ? (
                    <div
                      className="flex items-center gap-4 rounded-[28px] bg-white"
                      style={{ padding: 20, border: "3px solid #061A2E", boxShadow: "6px 6px 0 #3FC6FF" }}
                    >
                      <PhotoQrCode url={generation.downloadUrl} />
                      <div className="max-w-[180px]">
                        <p className="m-0 font-extrabold flex items-center gap-2" style={{ fontSize: 16 }}>
                          <QrCode className="w-5 h-5" style={{ color: "#FF6B4A" }} /> scan to download
                        </p>
                        <p className="bb-mono m-0 mt-1.5" style={{ fontSize: 12, color: "#3A5670" }}>
                          Point your phone's camera at the code to save your photo.
                        </p>
                      </div>
                    </div>
                  ) : generation.uploadStatus === "uploading" ? (
                    <div
                      className="flex items-center gap-3 rounded-[28px] bg-white bb-mono"
                      style={{ padding: 20, border: "3px solid #061A2E", fontSize: 14, color: "#3A5670" }}
                    >
                      <QrCode className="w-5 h-5" style={{ color: "#FF6B4A" }} /> preparing your QR code&hellip;
                    </div>
                  ) : generation.uploadStatus === "failed" ? (
                    <div
                      className="flex items-center gap-3 rounded-[28px] bg-white bb-mono max-w-[320px]"
                      style={{ padding: 20, border: "3px solid #061A2E", fontSize: 13, color: "#3A5670" }}
                    >
                      <QrCode className="w-5 h-5 shrink-0" style={{ color: "#FF6B4A" }} />
                      QR code unavailable right now (needs an internet connection and the photo upload service). Use the download button instead.
                    </div>
                  ) : null}
                  <button
                    onClick={() => generation.photoUrl && downloadFile(generation.photoUrl, "boat-booth-photo")}
                    className="bb-press inline-flex items-center gap-2 rounded-full font-extrabold"
                    style={{ padding: "16px 28px", background: "#FFFFFF", color: "#061A2E", fontSize: 17, border: "3px solid #061A2E", boxShadow: "5px 5px 0 #061A2E" }}
                  >
                    <Download className="w-5 h-5" /> download photo
                  </button>
                  <button onClick={reset} className="bb-mono self-center" style={{ fontSize: 14, color: "#061A2E", background: "none", border: "none" }}>
                    i&apos;m done, next guest &#8594;
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Renders a QR code for a given download URL, generated client-side via the
// `qrcode` package. Only used when a generation has a `downloadUrl` — the
// offline compositor doesn't set one (no backend to host the photo at a
// short URL), so guests get the "Download Photo" button instead; this stays
// ready for a future backend that can host photos for phone QR scanning.
function PhotoQrCode({ url }: { url: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(url, {
      width: 480,
      margin: 4, // full quiet zone — phone cameras fail to lock on without it
      errorCorrectionLevel: "L", // long Blob URLs: fewer, larger modules scan more reliably
      color: { dark: "#061A2E", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err) => console.error("QR generation failed:", err));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!qrDataUrl) {
    return <div className="w-[200px] h-[200px] rounded-2xl animate-pulse" style={{ background: "#F2FBFF", border: "2px solid #061A2E" }} />;
  }

  return <img src={qrDataUrl} alt="Scan to download your photo" className="w-[200px] h-[200px]" style={{ background: "#ffffff", imageRendering: "pixelated" }} />;
}

// Subcomponent for Webcam
function WebcamCapture({
  photoBase64,
  onCapture,
}: {
  photoBase64: string | null;
  onCapture: (base64: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  // The parent clears photoBase64 on "Retake" — mirror that here so this
  // component's own preview (camera capture or file upload) clears too,
  // instead of staying stuck on the old photo with no way back.
  useEffect(() => {
    if (!photoBase64) setCaptured(null);
  }, [photoBase64]);

  const startCamera = useCallback(async () => {
    try {
      // Ask for a high-res feed — the offline cutout crops tight to the
      // guest and scales that crop up to fill the result frame, so a sharp
      // source capture matters a lot more here than it would for a live
      // preview. Browsers pick the closest resolution the camera supports
      // when the exact ideal isn't available, so this degrades gracefully.
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setHasError(true);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]); // Removed stream from deps to prevent loop

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror drawing
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.9);
    setCaptured(base64);
    onCapture(base64);
  };

  const startCountdown = () => {
    setCountdown(3);
    let count = 3;
    const int = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(int);
        setCountdown(null);
        takePhoto();
      }
    }, 1000);
  };

  if (hasError) {
    if (captured) {
      return (
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
          <img src={captured} alt="Uploaded" className="w-full h-full object-contain" />
        </div>
      );
    }

    return (
      <div className="aspect-video flex flex-col items-center justify-center p-12 text-center rounded-[20px]" style={{ background: "#F2FBFF" }}>
        <Camera className="w-16 h-16 mb-4" style={{ color: "#7F98AF" }} />
        <h3 className="m-0 font-extrabold lowercase" style={{ fontSize: 24 }}>
          camera unavailable
        </h3>
        <p className="m-0 mt-2" style={{ color: "#3A5670" }}>
          Please allow camera access or use an alternative device.
        </p>
        <div className="mt-8">
          <label
            className="bb-press cursor-pointer inline-flex items-center rounded-full font-extrabold"
            style={{ padding: "16px 28px", background: "var(--bb-lime)", color: "#061A2E", fontSize: 16, border: "3px solid #061A2E", boxShadow: "4px 4px 0 #FF6B4A" }}
          >
            upload photo instead
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const res = ev.target?.result as string;
                    setCaptured(res);
                    onCapture(res);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden group">
      {captured ? (
        <img src={captured} alt="Captured" className="w-full h-full object-cover scale-x-[-1]" />
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {countdown !== null ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20">
              <span className="text-[15rem] font-black text-white drop-shadow-2xl animate-in zoom-in duration-300">
                {countdown}
              </span>
            </div>
          ) : (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
              <button
                onClick={startCountdown}
                className="rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ width: 96, height: 96, border: "4px solid var(--bb-lime)", background: "rgba(6,26,46,.35)", backdropFilter: "blur(6px)" }}
              >
                <div className="rounded-full" style={{ width: 64, height: 64, background: "var(--bb-lime)", boxShadow: "0 4px 0 #061A2E" }} />
              </button>
            </div>
          )}

          {/* Grid overlay for framing */}
          <div className="absolute inset-0 pointer-events-none opacity-20 hidden md:block">
            <div className="w-full h-full flex flex-col justify-evenly">
              <div className="border-t border-white/50 w-full" />
              <div className="border-t border-white/50 w-full" />
            </div>
            <div className="absolute inset-0 flex justify-evenly">
              <div className="border-l border-white/50 h-full" />
              <div className="border-l border-white/50 h-full" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
