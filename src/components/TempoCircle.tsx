import type { CSSProperties } from "react";

interface TempoCircleProps {
  playing: boolean;
  beat: number; // index du temps courant (0 = 1er temps)
  tick: number; // compteur global -> re-déclenche les animations CSS
  bpm: number;
  beats: number; // temps par mesure
  onTap: () => void; // tap tempo
  tapCount: number; // -> ondulation visuelle à chaque appui
}

/**
 * Le grand rond de tempo.
 * - Au repos : affiche le BPM (et sert de zone « tap tempo »).
 * - En marche : affiche le numéro du temps, s'illumine INTENSÉMENT de
 *   l'intérieur — ORANGE sur le 1er temps (accent), JAUNE ensuite —
 *   avec un halo qui déborde du cadran, visible de très loin.
 */
export default function TempoCircle({
  playing,
  beat,
  tick,
  bpm,
  beats,
  onTap,
  tapCount,
}: TempoCircleProps) {
  const shownBeat = beat % Math.max(beats, 1);
  const accent = playing && shownBeat === 0;

  // Couleur pilotée par le temps : jaune (1er, accent) / orange (autres) / gris (repos)
  const color = !playing ? "#55555f" : accent ? "#ffd60a" : "#ff8a1e";

  return (
    <div
      className="relative cursor-pointer touch-none select-none"
      style={
        {
          width: "min(96cqmin, 500px)",
          height: "min(96cqmin, 500px)",
          "--c": color,
        } as CSSProperties
      }
      role="button"
      aria-label="Tap tempo : touchez le rond au rythme pour mesurer le tempo"
      title="Tap tempo : touchez au rythme pour mesurer le BPM"
      onPointerDown={onTap}
    >
      {/* Anneau pointillé légèrement tournoyant en marche */}
      <div
        className={`pointer-events-none absolute -inset-4 rounded-full border border-dashed border-white/10 transition-opacity duration-500 ${
          playing
            ? "opacity-100 [animation:spin-slow_28s_linear_infinite]"
            : "opacity-40"
        }`}
      />
      <div className="pointer-events-none absolute -inset-1.5 rounded-full border border-white/[0.07]" />

      {/* Graduation des temps de la mesure autour du cadran */}
      {Array.from({ length: beats }).map((_, i) => {
        const angle = (360 / beats) * i;
        const active = playing && i === shownBeat;
        return (
          <div
            key={i}
            className="pointer-events-none absolute inset-0"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <span
              className={`absolute -top-[10px] left-1/2 -translate-x-1/2 rounded-full transition-all duration-150 ${
                active
                  ? "h-[24px] w-[6px] bg-[var(--c)] shadow-[0_0_18px_var(--c),0_0_36px_var(--c)]"
                  : "h-[14px] w-[4px] bg-white/25"
              }`}
            />
          </div>
        );
      })}

      {/* HALO externe — court et net */}
      {playing && (
        <div
          key={`halo-${tick}`}
          className="pointer-events-none absolute -inset-16 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--c) 35%, transparent) 0%, transparent 65%)",
            filter: "blur(25px)",
            animation: `halo-flash ${60 / bpm}s ease-out both`,
          }}
        />
      )}

      {/* Onde de choc (FLASH) */}
      {playing && (
        <div
          key={`ring-${tick}`}
          className="pointer-events-none absolute inset-0 rounded-full border-[var(--c)]"
          style={{
            animation: `ring-flash ${Math.max(0.35, 60 / bpm * 0.7)}s cubic-bezier(0, 0.5, 0.2, 1) both`,
          }}
        />
      )}

      {/* Ondulation à chaque appui (tap tempo) */}
      {tapCount > 0 && (
        <div
          key={`tap-${tapCount}`}
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/60"
          style={{ animation: "ring-flash 0.5s cubic-bezier(0, 0.5, 0.2, 1) both" }}
        />
      )}

      {/* Corps du rond — fond NOIR entre les flashs */}
      <div className="pointer-events-none absolute inset-1 rounded-full bg-[#06060a] border border-white/[0.06]" />

      {/* Flash du corps (par dessus le fond noir) */}
      {playing && (
        <div
          key={`core-${tick}`}
          className="pointer-events-none absolute inset-1 rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 32%, #1c1c22 0%, #0c0c0f 72%)",
            animation: `beat-flash ${60 / bpm}s linear both`,
          }}
        />
      )}

      {/* FLASH brûlant intérieur (blanc vers couleur) */}
      {playing && (
        <div
          key={`flash-${tick}`}
          className="pointer-events-none absolute inset-4 rounded-full blur-[2px]"
          style={{
            background:
              "radial-gradient(circle at 50% 46%, #ffffff 0%, color-mix(in srgb, var(--c) 80%, white) 25%, var(--c) 50%, transparent 85%)",
            animation: `fill-flash ${60 / bpm}s ease-out both`,
          }}
        />
      )}

      {/* Contenu central (impact instantané) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {playing ? (
          <div key={`num-${tick}`} style={{ animation: `num-flash ${60 / bpm}s ease-out both` }} className="flex flex-col items-center justify-center">
            <span
              className="font-display font-semibold leading-none text-white"
              style={{
                fontSize: "clamp(64px, 26cqmin, 118px)",
                textShadow: "0 0 25px rgba(255,255,255,0.8), 0 0 50px var(--c)",
              }}
            >
              {shownBeat + 1}
            </span>
            <span className="mt-3 text-[10px] font-medium uppercase tracking-[0.4em] text-white/80 [text-shadow:0_0_15px_rgba(255,255,255,0.4)]">
              {accent ? "Accent" : "Temps"}
            </span>
          </div>
        ) : (
          <>
            <span
              className="font-display font-semibold leading-none text-white/90"
              style={{ fontSize: "clamp(46px, 18cqmin, 86px)" }}
            >
              {bpm}
            </span>
            <span className="mt-2 text-[10px] font-medium uppercase tracking-[0.4em] text-white/35">
              bpm · prêt
            </span>
            <span className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.28em] text-white/25">
              toucher = tap tempo
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Rangée de pastilles récapitulant les temps de la mesure */
export function BeatDots({
  beats,
  beat,
  playing,
}: {
  beats: number;
  beat: number;
  playing: boolean;
}) {
  const shownBeat = beat % Math.max(beats, 1);
  return (
    <div className="flex h-6 items-center justify-center gap-10">
      {Array.from({ length: beats }).map((_, i) => {
        const active = playing && i === shownBeat;
        const accentDot = i === 0;
        return (
          <span
            key={i}
            className={`rounded-full transition-all duration-150 ${
              active
                ? "size-3 bg-[var(--dot-c)] shadow-[0_0_12px_var(--dot-c)]"
                : `size-2 ${accentDot ? "bg-yellow-400/40" : "bg-white/15"}`
            }`}
            style={
              {
                "--dot-c": accentDot ? "#ffd60a" : "#ff8a1e",
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
