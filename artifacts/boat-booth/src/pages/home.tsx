import React from "react";
import { Link } from "wouter";
import {
  useListGenerations,
  useGetBoothStats,
  getListGenerationsQueryKey,
  getGetBoothStatsQueryKey,
} from "@workspace/api-client-react";
import { ArrowRight } from "lucide-react";
import { useBrand } from "@/brand-bridge";
import { SCENE_IMAGES } from "@/lib/scenes";

const STEPS = [
  {
    num: "01",
    bg: "#8EDCFF",
    rotate: "-1.5deg",
    title: "pick a scene",
    description: "Bass fishing, boat cruising, dockside camp and more. Choose your boat day.",
  },
  {
    num: "02",
    bg: "var(--bb-lime)",
    rotate: "1deg",
    title: "strike a pose",
    description: "Look at the camera, smile, and we drop you into the scene in seconds.",
  },
  {
    num: "03",
    bg: "#FFB3EC",
    rotate: "-0.5deg",
    title: "take it home",
    description: "Download it or share it straight from the booth. Post-ready.",
  },
];

const EXPERIENCES = [
  {
    id: "bass-fishing",
    name: "bass fishing",
    tagline: "reel in the big one. (for the pics)",
    tag: "chill mode",
    tagBg: "#FF7AD9",
    shadow: "var(--bb-lime)",
    image: SCENE_IMAGES["bass-fishing"],
  },
  {
    id: "boat-cruising",
    name: "boat cruising",
    tagline: "captain your own crew.",
    tag: "smooth sailing",
    tagBg: "#8EDCFF",
    shadow: "#FF7AD9",
    image: SCENE_IMAGES["boat-cruising"],
  },
  {
    id: "trophy-catch",
    name: "trophy catch",
    tagline: "the one that didn't get away.",
    tag: "the big one",
    tagBg: "var(--bb-lime)",
    shadow: "#8B5CFF",
    image: SCENE_IMAGES["trophy-catch"],
  },
  {
    id: "lake-camp",
    name: "lake camp",
    tagline: "dockside glamping, trophy in hand.",
    tag: "cozy vibes",
    tagBg: "#FFD23F",
    shadow: "#8B5CFF",
    image: SCENE_IMAGES["lake-camp"],
  },
  {
    id: "dock-unwind",
    name: "dock unwind",
    tagline: "kick back, lake side.",
    tag: "golden hour",
    tagBg: "#FF6B4A",
    shadow: "#FFD23F",
    image: SCENE_IMAGES["dock-unwind"],
  },
];

type ObjStyle = React.CSSProperties;

function RingObj({ className = "", size = 190, style }: { className?: string; size?: number; style?: ObjStyle }) {
  return (
    <div className={`bb-obj bb-ring-wrap ${className}`} style={{ width: size, height: size, ...style }}>
      <div className="bb-ring" />
    </div>
  );
}

function BallObj({ className = "", size = 150, style }: { className?: string; size?: number; style?: ObjStyle }) {
  return (
    <div className={`bb-obj bb-ball ${className}`} style={{ width: size, height: size, ...style }}>
      <div className="bb-ball-stripes" />
      <div className="bb-ball-cap" />
      <div className="bb-ball-shade" />
    </div>
  );
}

function BuoyObj({ className = "", style }: { className?: string; style?: ObjStyle }) {
  return (
    <div className={`bb-obj ${className}`} style={{ width: 56, height: 130, ...style }}>
      <div className="bb-buoy" style={{ position: "relative", width: "100%", height: "100%" }}>
        <div className="bb-buoy-light" />
        <div className="bb-buoy-body" />
      </div>
    </div>
  );
}

function SunObj({ className = "", size = 130, style }: { className?: string; size?: number; style?: ObjStyle }) {
  return (
    <div className={`bb-obj ${className}`} style={{ width: size, height: size, ...style }}>
      <div className="bb-sun" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function SparkObj({
  className = "",
  size = 28,
  fill = "#FF6B4A",
  delay,
  style,
}: {
  className?: string;
  size?: number;
  fill?: string;
  delay?: string;
  style?: ObjStyle;
}) {
  return (
    <div className={`bb-obj bb-spark ${className}`} style={{ width: size, height: size, animationDelay: delay, ...style }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={fill} />
      </svg>
    </div>
  );
}

function BubbleObj({ className = "", size = 14, delay, style }: { className?: string; size?: number; delay?: string; style?: ObjStyle }) {
  return <div className={`bb-obj bb-bubble ${className}`} style={{ width: size, height: size, animationDelay: delay, ...style }} />;
}

function ShadesObj({ className = "", style }: { className?: string; style?: ObjStyle }) {
  return (
    <div className={`bb-obj bb-shades ${className}`} style={{ width: 170, ...style }}>
      <svg viewBox="0 0 170 64" width="170" height="64" aria-hidden="true">
        <defs>
          <linearGradient id="bb-lens" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF7AD9" />
            <stop offset=".55" stopColor="#8B5CFF" />
            <stop offset="1" stopColor="#3FC6FF" />
          </linearGradient>
        </defs>
        <path d="M6 10 H74 Q78 10 76 22 Q70 56 40 56 Q12 56 6 26 Z" fill="url(#bb-lens)" stroke="#061A2E" strokeWidth="4" />
        <path d="M96 10 H164 Q168 10 164 26 Q158 56 130 56 Q100 56 94 22 Q92 10 96 10 Z" fill="url(#bb-lens)" stroke="#061A2E" strokeWidth="4" />
        <path d="M74 18 Q85 10 96 18" fill="none" stroke="#061A2E" strokeWidth="5" strokeLinecap="round" />
        <path d="M18 18 L34 18" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round" />
        <path d="M108 18 L124 18" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PontoonBoat({ className = "", style }: { className?: string; style?: ObjStyle }) {
  return (
    <div className={`bb-obj bb-boat ${className}`} style={{ width: 220, ...style }}>
      <svg viewBox="0 0 220 120" width="220" height="120" aria-hidden="true">
        <defs>
          <linearGradient id="bb-pont" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".5" stopColor="#D9E4EE" />
            <stop offset="1" stopColor="#93A6B9" />
          </linearGradient>
          <linearGradient id="bb-deck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF8A6B" />
            <stop offset="1" stopColor="#E0482A" />
          </linearGradient>
          <linearGradient id="bb-canopy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E6FF7A" />
            <stop offset="1" stopColor="#A8D400" />
          </linearGradient>
        </defs>
        <path d="M30 20 H190 L180 34 H40 Z" fill="url(#bb-canopy)" stroke="#061A2E" strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 34 V62 M170 34 V62" stroke="#061A2E" strokeWidth="3" />
        <rect x="22" y="60" width="176" height="24" rx="6" fill="url(#bb-deck)" stroke="#061A2E" strokeWidth="3" />
        <rect x="64" y="46" width="34" height="16" rx="5" fill="#3FC6FF" stroke="#061A2E" strokeWidth="3" />
        <rect x="122" y="46" width="34" height="16" rx="5" fill="#3FC6FF" stroke="#061A2E" strokeWidth="3" />
        <rect x="14" y="86" width="196" height="18" rx="9" fill="url(#bb-pont)" stroke="#061A2E" strokeWidth="3" />
      </svg>
    </div>
  );
}

function Waves() {
  return (
    <div className="bb-obj" style={{ left: 0, right: 0, bottom: 0, height: 170 }}>
      <div className="bb-wave-row bb-slow" style={{ bottom: 40, height: 130 }}>
        <svg viewBox="0 0 2880 130" width="100%" height="130" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 Q180 10 360 60 T720 60 T1080 60 T1440 60 T1800 60 T2160 60 T2520 60 T2880 60 V130 H0 Z" fill="#8EDCFF" />
        </svg>
      </div>
      <div className="bb-wave-row" style={{ bottom: 0, height: 130 }}>
        <svg viewBox="0 0 2880 130" width="100%" height="130" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 Q240 20 480 70 T960 70 T1440 70 T1920 70 T2400 70 T2880 70 V130 H0 Z" fill="#3FC6FF" />
          <path
            d="M0 70 Q240 20 480 70 T960 70 T1440 70 T1920 70 T2400 70 T2880 70"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="2 22"
          />
        </svg>
      </div>
    </div>
  );
}

const MARQUEE_TEXT =
  "bass fishing ✦ boat cruising ✦ dockside camp ✦ main character energy ✦ no boat required ✦ golden hour on demand ✦ ";

export default function Home() {
  const brand = useBrand();
  const { data: stats } = useGetBoothStats({
    query: { queryKey: getGetBoothStatsQueryKey(), refetchInterval: 10000 },
  });
  const { data: recentGenerations } = useListGenerations(
    { limit: 12 },
    { query: { queryKey: getListGenerationsQueryKey({ limit: 12 }), refetchInterval: 10000 } },
  );

  const albumPhotos = (recentGenerations ?? []).slice(0, 3);
  const albumRotations = ["-8deg", "5deg", "-2deg"];
  const albumOffsets = [
    { left: "4%", top: 40, z: 1 },
    { left: "32%", top: 0, z: 2 },
    { left: "18%", top: 190, z: 3 },
  ];

  return (
    <div
      id="top"
      className="bb-root min-h-[100dvh] w-full overflow-hidden"
      style={{ "--bb-lime": "#C8F53A", color: "#061A2E", background: "#F2FBFF" } as React.CSSProperties}
    >
      {/* ===== HERO ===== */}
      <section
        className="relative px-6 pb-[220px] pt-7 overflow-hidden"
        style={{ minHeight: 900, background: "linear-gradient(180deg, #A8E6FF 0%, #D6F3FF 40%, #FFF4E2 100%)" }}
      >
        <SunObj className="bb-hide-sm" size={130} style={{ right: "20%", top: 110 }} />
        <RingObj style={{ left: "5%", top: 190 }} size={190} />
        <BallObj className="bb-hide-sm" size={150} style={{ right: "6%", top: 250 }} />
        <BuoyObj className="bb-hide-sm" style={{ left: "13%", bottom: 190 }} />
        <ShadesObj className="bb-hide-sm" style={{ right: "12%", bottom: 250 }} />
        <SparkObj size={28} fill="#FF6B4A" style={{ left: "26%", top: 150 }} />
        <SparkObj size={20} fill="#FF7AD9" delay=".8s" style={{ right: "32%", top: 420 }} />
        <SparkObj className="bb-hide-sm" size={22} fill="#8B5CFF" delay="1.5s" style={{ left: "20%", top: 470 }} />
        <BubbleObj style={{ left: "30%", bottom: 120 }} />
        <BubbleObj size={10} delay="2s" style={{ left: "48%", bottom: 100 }} />
        <BubbleObj delay="4s" style={{ left: "70%", bottom: 130 }} />
        <BubbleObj size={9} delay="1s" style={{ left: "84%", bottom: 110 }} />
        <PontoonBoat className="bb-hide-sm" style={{ left: "58%", bottom: 112 }} />
        <Waves />

        {/* nav */}
        <nav
          className="relative z-[3] mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 rounded-full py-3 pl-[18px] pr-3"
          style={{ background: "rgba(255,255,255,.75)", border: "2px solid #061A2E", boxShadow: "4px 4px 0 #061A2E" }}
        >
          <a href="#top" className="flex items-center gap-2.5 no-underline" style={{ color: "#061A2E" }}>
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={brand.brandName}
                className="rounded-full object-contain"
                style={{ width: brand.logoSize, height: brand.logoSize }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="inline-block rounded-full"
                style={{
                  width: 38,
                  height: 38,
                  background: "conic-gradient(#FF6B4A 0 25%, #FFE1D6 0 50%, #FF6B4A 0 75%, #FFE1D6 0)",
                  WebkitMask: "radial-gradient(circle, transparent 34%, #000 35%)",
                  mask: "radial-gradient(circle, transparent 34%, #000 35%)",
                }}
              />
            )}
            <span className="font-extrabold tracking-tight" style={{ fontSize: 24 }}>
              {brand.brandName}
            </span>
          </a>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#scenes" className="bb-mono no-underline" style={{ fontSize: 14, color: "#061A2E" }}>
              scenes
            </a>
            <a href="#how" className="bb-mono no-underline" style={{ fontSize: 14, color: "#061A2E" }}>
              how it works
            </a>
            <Link
              href="/create"
              className="bb-press rounded-full px-[22px] py-3 font-extrabold no-underline"
              style={{ background: "var(--bb-lime)", color: "#061A2E", fontSize: 16, border: "2px solid #061A2E", boxShadow: "4px 4px 0 #FF6B4A" }}
            >
              start now
            </Link>
          </div>
        </nav>

        {/* hero copy */}
        <div className="relative z-[2] mx-auto flex max-w-[1000px] flex-col items-center gap-7 pt-[110px] text-center">
          <span
            className="bb-mono rounded-full"
            style={{
              fontSize: 13,
              padding: "8px 16px",
              background: "#FFFFFF",
              border: "2px solid #061A2E",
              boxShadow: "3px 3px 0 #3FC6FF",
              transform: "rotate(-3deg)",
            }}
          >
            interactive photo booth &#10022; no boat needed
          </span>
          <h1
            className="m-0 font-extrabold lowercase"
            style={{
              fontSize: "clamp(56px, 9vw, 136px)",
              lineHeight: 0.9,
              letterSpacing: "-0.05em",
              fontFamily: "var(--brand-font, inherit)",
            }}
          >
            {brand.heading}
          </h1>
          <p className="m-0 max-w-[620px]" style={{ fontSize: "clamp(18px, 2vw, 22px)", lineHeight: 1.45, color: "#2E4A63" }}>
            {brand.tagline}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-[18px]">
            <Link
              href="/create"
              className="bb-press inline-flex items-center gap-3.5 rounded-full font-extrabold no-underline"
              style={{
                padding: "22px 34px",
                background: "var(--bb-lime)",
                color: "#061A2E",
                fontSize: 22,
                border: "3px solid #061A2E",
                boxShadow: "7px 7px 0 #FF6B4A",
              }}
            >
              start your experience
              <ArrowRight className="w-6 h-6" />
            </Link>
            <a href="#how" className="bb-mono no-underline" style={{ fontSize: 15, color: "#061A2E" }}>
              how it works &#8595;
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1.5">
            <span className="bb-mono rounded-full" style={{ fontSize: 13, padding: "8px 14px", background: "#FFFFFF", border: "2px solid #061A2E", transform: "rotate(2deg)" }}>
              &#9201; ready in 60s
            </span>
            <span className="bb-mono rounded-full" style={{ fontSize: 13, padding: "8px 14px", background: "#FF7AD9", border: "2px solid #061A2E", transform: "rotate(-2deg)" }}>
              no login. ever.
            </span>
            <span className="bb-mono rounded-full" style={{ fontSize: 13, padding: "8px 14px", background: "#FFD23F", border: "2px solid #061A2E", transform: "rotate(1.5deg)" }}>
              100% free
            </span>
          </div>
        </div>
      </section>

      {/* ===== MARQUEE ===== */}
      <div
        className="relative z-[4] overflow-hidden"
        style={{ background: "#FF6B4A", borderTop: "3px solid #061A2E", borderBottom: "3px solid #061A2E", transform: "rotate(-1.5deg)", margin: "-30px -20px 0", padding: "16px 0" }}
      >
        <div className="bb-track font-extrabold whitespace-nowrap" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>
          <span style={{ paddingRight: 40 }}>{MARQUEE_TEXT}</span>
          <span style={{ paddingRight: 40 }}>{MARQUEE_TEXT}</span>
        </div>
      </div>

      {/* ===== SCENES ===== */}
      <section id="scenes" className="mx-auto max-w-[1240px] px-6" style={{ padding: "140px 24px 120px" }}>
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(44px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
            pick ur{" "}
            <span
              className="inline-block rounded-[0.2em]"
              style={{ padding: "0 0.15em", background: "var(--bb-lime)", transform: "rotate(-2deg)" }}
            >
              vibe
            </span>
          </h2>
          <p className="bb-mono m-0 max-w-[300px]" style={{ fontSize: 14, lineHeight: 1.6, color: "#3A5670" }}>
            5 scenes. zero sunburn. each one renders in seconds.
          </p>
        </div>
        <div className="grid gap-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
          {EXPERIENCES.map((exp) => (
            <Link
              key={exp.id}
              href="/create"
              className="bb-tilt flex flex-col overflow-hidden rounded-[28px] bg-white no-underline"
              style={{ color: "#061A2E", border: "3px solid #061A2E", boxShadow: `8px 8px 0 ${exp.shadow}` }}
            >
              <div className="relative h-[300px] overflow-hidden">
                <img src={exp.image} alt={exp.name} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
                <span
                  className="bb-mono absolute rounded-full"
                  style={{ left: 16, top: 16, fontSize: 12, padding: "6px 12px", background: exp.tagBg, border: "2px solid #061A2E", transform: "rotate(-4deg)" }}
                >
                  {exp.tag}
                </span>
              </div>
              <div className="flex flex-col gap-2" style={{ padding: "22px 24px 26px" }}>
                <h3 className="m-0 font-extrabold lowercase" style={{ fontSize: 32, letterSpacing: "-0.03em" }}>
                  {exp.name}
                </h3>
                <p className="m-0" style={{ fontSize: 17, color: "#3A5670" }}>
                  {exp.tagline}
                </p>
                <span className="mt-2 font-extrabold" style={{ fontSize: 16 }}>
                  try this scene &#8594;
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section
        id="how"
        className="relative overflow-hidden px-6"
        style={{ background: "#FFF1E6", borderTop: "3px solid #061A2E", borderBottom: "3px solid #061A2E", padding: "120px 24px" }}
      >
        <RingObj className="bb-hide-sm" size={130} style={{ right: "4%", top: 60 }} />
        <div className="relative mx-auto max-w-[1240px]">
          <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(44px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-0.04em", marginBottom: 14 }}>
            3 steps.
            <br />
            that&apos;s it. fr.
          </h2>
          <p className="bb-mono m-0" style={{ fontSize: 15, color: "#3A5670", marginBottom: 56 }}>
            between you and your next profile pic.
          </p>
          <div className="grid gap-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex flex-col gap-3 rounded-[28px]"
                style={{ background: step.bg, border: "3px solid #061A2E", boxShadow: "8px 8px 0 #061A2E", transform: `rotate(${step.rotate})`, padding: 30 }}
              >
                <span
                  className="font-extrabold"
                  style={{ fontSize: 96, lineHeight: 0.8, color: "#FFFFFF", WebkitTextStroke: "3px #061A2E" }}
                >
                  {step.num}
                </span>
                <h3 className="font-extrabold lowercase" style={{ margin: "8px 0 0", fontSize: 30, letterSpacing: "-0.03em" }}>
                  {step.title}
                </h3>
                <p className="m-0" style={{ fontSize: 17, lineHeight: 1.5 }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LIVE FROM THE BOOTH ===== */}
      <section className="mx-auto max-w-[1240px] px-6" style={{ padding: "130px 24px 120px" }}>
        <div className="grid items-center gap-12" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="flex flex-col gap-5">
            <span
              className="bb-mono inline-flex items-center gap-2 self-start rounded-full"
              style={{ fontSize: 13, padding: "8px 14px", background: "#FFFFFF", border: "2px solid #061A2E" }}
            >
              <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: "#FF6B4A" }} />
              live from the booth
            </span>
            <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(44px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}>
              today&apos;s
              <br />
              <span className="inline-block rounded-[0.2em]" style={{ padding: "0 0.15em", background: "#FF7AD9", transform: "rotate(-2deg)" }}>
                album
              </span>
            </h2>
            <div className="flex items-baseline gap-3.5">
              <span className="font-extrabold" style={{ fontSize: 120, lineHeight: 0.85, letterSpacing: "-0.05em" }}>
                {stats?.totalCreations || 0}
              </span>
              <span className="bb-mono" style={{ fontSize: 14, color: "#3A5670" }}>
                photos today
              </span>
            </div>
            <p className="m-0 max-w-[420px]" style={{ fontSize: 19, lineHeight: 1.5, color: "#2E4A63" }}>
              {albumPhotos.length > 0 ? "Fresh off the booth — come add yours to the wall." : "The album's empty. Be first and you're the cover star."}
            </p>
            <Link
              href="/create"
              className="bb-press self-start rounded-full font-extrabold no-underline"
              style={{ padding: "16px 26px", background: "#FFFFFF", color: "#061A2E", fontSize: 18, border: "3px solid #061A2E", boxShadow: "5px 5px 0 var(--bb-lime)" }}
            >
              claim the cover &#8594;
            </Link>
          </div>
          <div className="relative" style={{ height: 440 }}>
            {albumOffsets.map((pos, i) => {
              const gen = albumPhotos[i];
              return (
                <div
                  key={i}
                  className="absolute rounded-[6px] bg-white"
                  style={{
                    left: pos.left,
                    top: pos.top,
                    width: 220,
                    padding: "12px 12px 44px",
                    border: "2px solid #061A2E",
                    boxShadow: "0 18px 30px rgba(6,26,46,.15)",
                    transform: `rotate(${albumRotations[i]})`,
                    zIndex: pos.z,
                  }}
                >
                  <div
                    className="bb-mono flex items-center justify-center rounded"
                    style={{ height: 220, border: "3px dashed #7F98AF", color: "#3A5670", fontSize: 13, overflow: "hidden" }}
                  >
                    {gen?.photoUrl ? (
                      <img src={gen.photoUrl} alt={gen.sceneName ?? "guest photo"} className="h-full w-full object-cover" />
                    ) : (
                      <span>[{i === 1 && albumPhotos.length === 0 ? "your photo here" : "guest photo"}]</span>
                    )}
                  </div>
                  {i === 1 && albumPhotos.length === 0 && (
                    <span
                      className="bb-mono absolute rounded-full"
                      style={{ right: -18, top: -18, fontSize: 12, padding: "8px 12px", background: "var(--bb-lime)", color: "#061A2E", border: "2px solid #061A2E", transform: "rotate(10deg)" }}
                    >
                      be first!
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section id="start" className="px-6" style={{ padding: "0 24px 120px" }}>
        <div
          className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[40px] text-center"
          style={{ background: "var(--bb-lime)", color: "#061A2E", border: "3px solid #061A2E", padding: "90px 32px", boxShadow: "12px 12px 0 #FF6B4A" }}
        >
          <BallObj className="bb-hide-sm" size={110} style={{ left: "6%", top: 50 }} />
          <RingObj className="bb-hide-sm" size={140} style={{ right: "6%", bottom: 40 }} />
          <SparkObj size={30} fill="#FF6B4A" style={{ right: "22%", top: 50 }} />
          <div className="relative z-[2] flex flex-col items-center gap-6">
            <h2 className="m-0 font-extrabold lowercase" style={{ fontSize: "clamp(48px, 7.5vw, 112px)", lineHeight: 0.9, letterSpacing: "-0.05em" }}>
              ready to make
              <br />a splash?
            </h2>
            <p className="m-0 max-w-[520px]" style={{ fontSize: 20, lineHeight: 1.45 }}>
              Step up to the booth. One minute, one pose, one very shareable photo.
            </p>
            <Link
              href="/create"
              className="bb-press inline-flex items-center gap-3.5 rounded-full font-extrabold no-underline"
              style={{ padding: "22px 36px", background: "#FFFFFF", color: "#061A2E", fontSize: 22, border: "3px solid #061A2E", boxShadow: "7px 7px 0 #FF6B4A" }}
            >
              start your experience
              <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{ borderTop: "2px solid #061A2E", background: "#FFFFFF", padding: "32px 24px" }}>
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4">
          <span className="font-extrabold" style={{ fontSize: 22, letterSpacing: "-0.03em" }}>
            {brand.brandName}
          </span>
          <span className="bb-mono" style={{ fontSize: 13, color: "#3A5670" }}>
            &#10022; see yourself on the water
          </span>
        </div>
      </footer>
    </div>
  );
}
