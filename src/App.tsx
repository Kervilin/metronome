import { useCallback, useEffect, useRef, useState } from "react";
import { Guitar, Mic, Volume2, VolumeX } from "lucide-react";
import ControlPanel from "./components/ControlPanel";
import PhoneFrame, { StatusBar } from "./components/PhoneFrame";
import TempoAnalyzer from "./components/TempoAnalyzer";
import Tuner from "./components/Tuner";
import TempoCircle, { BeatDots } from "./components/TempoCircle";
import { useMetronome } from "./hooks/useMetronome";

const MIN_BPM = 30;
const MAX_BPM = 300;
const TAP_WINDOW_MS = 2000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function App() {
  /* ── TOUS les hooks en haut, SANS EXCEPTION ── */
  const [screen, setScreen] = useState<"metronome" | "analyzer" | "tuner">("metronome");
  const [showAbout, setShowAbout] = useState(false);
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(2);
  const [muted, setMuted] = useState(false);
  const { isPlaying, currentBeat, tick, toggle } = useMetronome(bpm, beats, muted);

  const tapsRef = useRef<number[]>([]);
  const tapTimerRef = useRef<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [tapBpm, setTapBpm] = useState<number | null>(null);

  const setBpmClamped = useCallback(
    (v: number) => setBpm((prev) => clamp(Number.isFinite(v) ? v : prev, MIN_BPM, MAX_BPM)),
    []
  );
  const nudgeBpm = useCallback(
    (delta: number) => setBpm((b) => clamp(b + delta, MIN_BPM, MAX_BPM)),
    []
  );
  const setBeatsClamped = useCallback((v: number) => setBeats(clamp(v, 1, 12)), []);

  const handleTap = useCallback(() => {
    const now = performance.now();
    setTapCount((c) => c + 1);
    const recent = tapsRef.current.filter((t) => now - t < TAP_WINDOW_MS).slice(-7);
    recent.push(now);
    tapsRef.current = recent;
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((t, i) => t - recent[i]).filter((d) => d > 0);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const measured = clamp(Math.round(60000 / avg), MIN_BPM, MAX_BPM);
      setBpm(measured);
      setTapBpm(measured);
      if (tapTimerRef.current !== null) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = window.setTimeout(() => setTapBpm(null), 1400);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current !== null) clearTimeout(tapTimerRef.current);
    };
  }, []);

  /* Raccourcis clavier — actifs seulement sur l'écran métronome */
  useEffect(() => {
    if (screen !== "metronome") return;
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      switch (e.code) {
        case "Space":    e.preventDefault(); toggle();             break;
        case "ArrowRight": e.preventDefault(); nudgeBpm(1);       break;
        case "ArrowLeft":  e.preventDefault(); nudgeBpm(-1);      break;
        case "ArrowUp":    e.preventDefault(); nudgeBpm(5);       break;
        case "ArrowDown":  e.preventDefault(); nudgeBpm(-5);      break;
        case "KeyT":    handleTap();                               break;
        case "KeyM":    setMuted((m) => !m);                      break;
        case "KeyA":    setScreen("analyzer");                     break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, toggle, nudgeBpm, handleTap]);

  /* ── Rendu conditionnel APRÈS tous les hooks ── */
  if (screen === "analyzer") {
    return <TempoAnalyzer onBack={() => setScreen("metronome")} />;
  }
  if (screen === "tuner") {
    return <Tuner onBack={() => setScreen("metronome")} />;
  }

  /* ── Écran métronome ── */
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050506] font-sans text-white">
      {/* Décor arrière-plan PC */}
      <div className="pointer-events-none fixed inset-0 hidden md:block" aria-hidden>
        <div className="absolute -left-40 -top-40 size-[46rem] rounded-full bg-orange-600/20 blur-[140px] [animation:float-slow_14s_ease-in-out_infinite]" />
        <div className="absolute -bottom-48 -right-40 size-[44rem] rounded-full bg-amber-400/15 blur-[150px] [animation:float-slow_18s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/[0.07] blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-center">
          <span
            className="font-display font-bold leading-none text-white/[0.035] transition-all duration-500"
            style={{ fontSize: "min(30vw, 30rem)" }}
          >
            {bpm}
          </span>
        </div>
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute left-8 top-7 flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-orange-500 shadow-[0_0_14px_#ff8a1e]" />
          <span className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60">Métronome</span>
        </div>
        <div className="absolute right-8 top-7 text-[11px] font-medium uppercase tracking-[0.22em] text-white/30">
          Prototype v0.3 — essai sur PC
        </div>
        <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-6 text-[11px] font-medium tracking-wide text-white/30">
          <span><span className="text-white/50">Espace</span> — Marche / Arrêt</span>
          <span className="h-3 w-px bg-white/15" />
          <span><span className="text-white/50">← →</span> — ±1 bpm</span>
          <span><span className="text-white/50">↑ ↓</span> — ±5 bpm</span>
          <span className="h-3 w-px bg-white/15" />
          <span><span className="text-white/50">T</span> — tap tempo</span>
          <span><span className="text-white/50">M</span> — muet</span>
          <span><span className="text-white/50">A</span> — analyseur</span>
        </div>
      </div>

      {/* Téléphone */}
      <main className="relative z-10 flex min-h-dvh items-center justify-center">
        <PhoneFrame>
          <div className="flex h-full flex-col">
            <StatusBar />

            <header className="flex shrink-0 items-center justify-between px-6 pb-2 pt-1">
              <div className="flex items-center gap-2.5">
                <span
                  className={`size-2 rounded-full transition-all duration-300 ${
                    isPlaying ? "bg-orange-500 shadow-[0_0_12px_#ff8a1e]" : "bg-white/25"
                  }`}
                />
                <h1
                  className="text-xs font-bold uppercase tracking-[0.3em] text-white/80 cursor-pointer select-none active:opacity-60"
                  onClick={() => setShowAbout(a => !a)}
                  title="À propos"
                >Métronome</h1>
              </div>

              <div className="flex items-center gap-2">
                {/* Bouton Accordeur */}
                <button
                  type="button"
                  onClick={() => setScreen("tuner")}
                  aria-label="Ouvrir l'accordeur"
                  title="Accordeur chromatique"
                  className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-all duration-200 hover:bg-white/10 active:scale-90"
                >
                  <Guitar className="size-4" />
                </button>

                {/* Bouton Analyseur */}
                <button
                  type="button"
                  onClick={() => setScreen("analyzer")}
                  aria-label="Ouvrir l'analyseur de tempo"
                  title="Analyseur de tempo (micro)"
                  className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-all duration-200 hover:bg-white/10 active:scale-90"
                >
                  <Mic className="size-4" />
                </button>

                {/* Bouton Muet */}
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-pressed={muted}
                  aria-label={muted ? "Activer le son" : "Couper le son"}
                  title={muted ? "Activer le son (M)" : "Couper le son (M)"}
                  className={`grid size-9 place-items-center rounded-full border transition-all duration-200 active:scale-90 ${
                    muted
                      ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
                      : "border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/10"
                  }`}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>


              </div>
            </header>

            {showAbout && (
              <p className="shrink-0 text-center text-[10px] font-medium tracking-wide text-white/40 py-1">
                Appli développée par Denis — 11/2026
              </p>
            )}

            <section
              className="circle-zone relative flex min-h-0 flex-1 items-center justify-center py-2"
              onClick={(e) => {
                // Arrêt si clic en dehors du rond (sur le fond de la section)
                if (e.target === e.currentTarget && isPlaying) toggle();
              }}
            >
              <TempoCircle
                playing={isPlaying}
                beat={currentBeat}
                tick={tick}
                bpm={bpm}
                beats={beats}
                onTap={handleTap}
                tapCount={tapCount}
              />
              {tapBpm !== null && (
                <div
                  key={`${tapBpm}-${tapCount}`}
                  className="absolute left-1/2 top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-orange-400/40 bg-black/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200 shadow-[0_8px_30px_-8px_rgba(255,138,30,0.5)] backdrop-blur [animation:chip-in_0.25s_ease-out_both]"
                >
                  Tap tempo · {tapBpm} bpm
                </div>
              )}
            </section>

            <div className="shrink-0 pb-1 pt-1">
              <BeatDots beats={beats} beat={currentBeat} playing={isPlaying} />
            </div>
            <p className="shrink-0 pb-2 text-center text-[10px] font-medium tracking-[0.14em] text-white/30">
              Touchez le grand rond au rythme pour mesurer le tempo
            </p>

            <ControlPanel
              bpm={bpm}
              onBpmChange={setBpmClamped}
              beats={beats}
              onBeatsChange={setBeatsClamped}
              playing={isPlaying}
              onToggle={toggle}
              minBpm={MIN_BPM}
              maxBpm={MAX_BPM}
            />

            <div className="grid h-9 shrink-0 place-items-center">
              <div className="h-1 w-28 rounded-full bg-white/20" />
            </div>
          </div>
        </PhoneFrame>
      </main>
    </div>
  );
}
