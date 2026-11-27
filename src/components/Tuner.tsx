import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft } from "lucide-react";
import { useTuner, type FreqPoint } from "../hooks/useTuner";

/* ─────────────── Courbe ─────────────── */
function drawFreqCurve(canvas: HTMLCanvasElement, history: FreqPoint[], viewSec: number) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height; if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext("2d")!; g.scale(dpr, dpr);
  g.fillStyle = "#0a0a12"; g.fillRect(0, 0, W, H);
  if (history.length < 2) return;
  const now = history[history.length - 1].time; const tMin = Math.max(0, now - viewSec);
  const pts = history.filter(p => p.time >= tMin); if (pts.length < 2) return;
  const freqs = pts.map(p => p.freq);
  const fMin = Math.max(50, Math.min(...freqs) - 15), fMax = Math.max(...freqs) + 15;
  const ML = 44, MR = 6, MT = 8, MB = 4; const PW = W - ML - MR, PH = H - MT - MB;
  g.font = "9px sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  const fStep = fMax - fMin > 200 ? 50 : fMax - fMin > 80 ? 20 : 10;
  for (let f = Math.ceil(fMin / fStep) * fStep; f <= fMax; f += fStep) {
    const y = MT + (1 - (f - fMin) / (fMax - fMin)) * PH;
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.beginPath(); g.moveTo(ML, y); g.lineTo(ML + PW, y); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillText(`${Math.round(f)}`, ML - 4, y);
  }
  g.save(); g.shadowColor = "#00d4ff"; g.shadowBlur = 8; g.beginPath();
  pts.forEach((p, i) => { const x = ML + ((p.time - tMin) / viewSec) * PW, y = MT + (1 - (p.freq - fMin) / (fMax - fMin)) * PH; i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
  g.strokeStyle = "#00d4ff"; g.lineWidth = 2; g.stroke(); g.restore();
}

export default function Tuner({ onBack }: { onBack: () => void }) {
  const { isActive, data, chord, freqHistory, error, level, start, stop, resume, diapasonOn, toggleDiapason } = useTuner();
  const [showCurve, setShowCurve] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Démarrage automatique du micro à l'ouverture
  useEffect(() => {
    start();
    return () => { stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filet de sécurité autoplay : dès le premier geste utilisateur, on relance
  // l'AudioContext s'il est resté « suspended » (sinon les AnalyserNode
  // renvoient du silence et l'accordeur n'est plus à l'écoute).
  useEffect(() => {
    const kick = () => resume();
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [resume]);

  const redraw = useCallback(() => { if (canvasRef.current && showCurve) drawFreqCurve(canvasRef.current, freqHistory, 15); }, [freqHistory, showCurve]);
  useEffect(() => { const id = requestAnimationFrame(redraw); return () => cancelAnimationFrame(id); }, [redraw]);
  useEffect(() => { const obs = new ResizeObserver(() => requestAnimationFrame(redraw)); if (containerRef.current) obs.observe(containerRef.current); return () => obs.disconnect(); }, [redraw]);

  const color = useMemo(() => {
    if (!data) return { bg: "#111118", ring: "rgba(255,255,255,0.08)", text: "text-white/30", bar: "#555" };
    const c = Math.abs(data.cents); const dimmed = !data.hasSignal;
    if (c <= 5) return { bg: dimmed ? "#061508" : "#07200a", ring: "rgba(34,197,94,0.65)", text: "text-green-400", bar: "#22c55e" };
    if (c <= 20) return { bg: dimmed ? "#18150a" : "#1f1a04", ring: "rgba(250,204,21,0.55)", text: "text-yellow-400", bar: "#facc15" };
    return { bg: dimmed ? "#180608" : "#200408", ring: "rgba(239,68,68,0.45)", text: "text-red-400", bar: "#ef4444" };
  }, [data]);

  const listening = isActive && !error;
  const direction = useMemo(() => { if (!data || Math.abs(data.cents) <= 5) return null; return data.cents < 0 ? "↑ Montez" : "↓ Descendez"; }, [data]);
  const gaugeLeft = data ? Math.max(2, Math.min(97, 50 + data.cents)) : 50;

  return (
    <div className="fixed inset-0 z-50 flex flex-col font-sans text-white transition-colors duration-500" style={{ backgroundColor: color.bg, paddingTop: "env(safe-area-inset-top, 20px)" }}>
      {/* ── Header compact mobile ── */}
      <header className="flex h-12 shrink-0 items-center border-b border-white/10 bg-black/30 px-2 gap-1.5">
        <button onClick={onBack} className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/80 active:scale-95">
          <ArrowLeft className="size-4" />
        </button>
        <button onClick={toggleDiapason} className={`flex shrink-0 items-center rounded-lg border px-2 py-1.5 text-[10px] font-bold ${diapasonOn ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-white/10 bg-white/5 text-white/50"}`}>
          La440
        </button>
        <button onClick={() => setShowCurve(c => !c)} className={`flex shrink-0 items-center rounded-lg border p-2 ${showCurve ? "border-cyan-500 bg-cyan-500/15 text-cyan-300" : "border-white/10 bg-white/5 text-white/50"}`}>
          <Activity className="size-3.5" />
        </button>
        {/* Statut micro : on voit d'un coup d'œil si l'accordeur écoute */}
        <span
          title={listening ? "Micro actif" : "Micro inactif"}
          className={`flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[9px] font-bold uppercase tracking-[0.14em] ${
            listening ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/40"
          }`}
        >
          <span className={`size-1.5 rounded-full ${listening ? "animate-pulse bg-emerald-400" : "bg-white/30"}`} />
          <span className="hidden sm:inline">{listening ? "À l'écoute" : "Micro off"}</span>
        </span>

        {/* VU-mètre du niveau micro */}
        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-white/10 md:block" aria-hidden>
          <span
            className="block h-full rounded-full bg-emerald-400 transition-[width] duration-75"
            style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }}
          />
        </span>

        <div className="flex-1" />
      </header>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          <span className="flex-1">⚠️ {error}</span>
          <button
            type="button"
            onClick={() => start()}
            className="shrink-0 rounded-md border border-red-400/40 bg-red-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-200 active:scale-95"
          >
            Réessayer
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col items-center justify-evenly px-4 py-2">

        {/* ── Si accord détecté : affichage grand accord uniquement ── */}
        {chord ? (
          <section className="flex w-full flex-1 items-center justify-center px-4">
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-6 rounded-[28px] border-2 border-orange-500/30 bg-orange-500/[0.06] px-6 py-8 shadow-[0_0_0_1px_rgba(255,138,30,0.08),0_24px_80px_-30px_rgba(255,138,30,0.25)]">
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-bold uppercase tracking-[0.32em] text-orange-200/60">
                  Accord détecté
                </p>
              </div>

              {/* Nom de l'accord très grand */}
              <div className="text-center">
                <p className="font-display text-8xl font-bold leading-none text-white">
                  {chord.root}
                </p>
                <p className="mt-3 text-4xl font-semibold text-white/70">
                  {chord.quality}
                </p>
              </div>

              {/* Notes de l'accord */}
              <div className="flex flex-wrap justify-center gap-3">
                {chord.notes.map((n, i) => (
                  <span key={i} className={`px-4 py-2 rounded-full border text-base font-bold ${
                    n === chord.root
                      ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                      : 'border-white/20 bg-white/5 text-white/60'
                  }`}>{n}</span>
                ))}
              </div>

              {/* Direction si pas accordé */}
              {direction && (
                <span className={`text-2xl font-bold ${color.text}`}>{direction}</span>
              )}
              {data?.hasSignal && data.isInTune && (
                <span className="text-2xl font-bold text-green-400">✓ Accordé !</span>
              )}
            </div>
          </section>

        ) : (
          /* ── Sinon : mode accordeur note seule ── */
          <section className="flex w-full flex-col items-center gap-4">
            {/* Jauge cents */}
            <div className="relative h-4 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="absolute left-[46%] h-full w-[8%] bg-green-500/20" />
              <div className="absolute top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full transition-all duration-100"
                style={{ left: `${gaugeLeft}%`, background: color.bar, boxShadow: `0 0 10px ${color.bar}` }} />
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
            </div>

            {/* Grand cercle de note */}
            <div className="relative grid size-52 place-items-center rounded-full border-4 transition-all duration-500"
              style={{ borderColor: color.ring, boxShadow: data?.hasSignal && data.isInTune ? "0 0 60px rgba(34,197,94,0.3)" : "none" }}>
              {data && !data.hasSignal && (
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/50">figé</span>
              )}
              <div className="text-center">
                <span className="font-display text-7xl font-bold">{data ? data.note : "—"}</span>
                {data && <span className="ml-1 text-2xl font-medium text-white/30">{data.octave}</span>}
              </div>
            </div>

            {/* Direction */}
            <div className="h-8 flex items-center">
              {data?.hasSignal && data.isInTune
                ? <span className="text-2xl font-bold text-green-400">✓ Accordé !</span>
                : direction
                  ? <span className={`text-2xl font-bold ${color.text}`}>{direction}</span>
                  : isActive
                    ? <span className="text-white/20 text-sm italic">Jouez une note...</span>
                    : (
                      <button
                        type="button"
                        onClick={() => start()}
                        className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/80 transition active:scale-95"
                      >
                        Activer le micro
                      </button>
                    )
              }
            </div>

            {/* Fréquences */}
            <div className="grid w-full max-w-xs grid-cols-3 gap-2 text-center text-white/80">
              <div className="bg-white/5 p-2 rounded-xl">
                <p className="text-[8px] uppercase opacity-40">Lue</p>
                <p className="text-lg font-bold">{data ? data.frequency : "—"}</p>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <p className="text-[8px] uppercase opacity-40">Écart</p>
                <p className={`text-lg font-bold ${color.text}`}>{data ? (data.cents > 0 ? "+" : "") + data.cents : "—"}</p>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <p className="text-[8px] uppercase opacity-40">Cible</p>
                <p className="text-lg font-bold">{data ? data.targetFreq : "—"}</p>
              </div>
            </div>

            <div className="w-full max-w-xs h-px bg-white/10" />
            
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">
              Jouez plusieurs notes pour l'accord
            </p>
          </section>
        )}
      </main>
      {showCurve && <div ref={containerRef} className="shrink-0 h-32 border-t border-white/10 p-2"><canvas ref={canvasRef} className="block h-full w-full rounded-lg bg-[#050508]" /></div>}
    </div>
  );
}
