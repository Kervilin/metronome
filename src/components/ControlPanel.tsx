import { Minus, Play, Plus, Square } from "lucide-react";
import type { ReactNode } from "react";

interface ControlPanelProps {
  bpm: number;
  onBpmChange: (value: number) => void;
  beats: number;
  onBeatsChange: (value: number) => void;
  playing: boolean;
  onToggle: () => void;
  minBpm: number;
  maxBpm: number;
}

/** Petit bouton rond − / + pour le stepper */
function StepButton({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/85 transition-all duration-150 hover:bg-white/10 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

export default function ControlPanel({
  bpm,
  onBpmChange,
  beats,
  onBeatsChange,
  playing,
  onToggle,
  minBpm,
  maxBpm,
}: ControlPanelProps) {
  const progress = ((bpm - minBpm) / (maxBpm - minBpm)) * 100;
  const quickSteps = [-5, -1, 1, 5];

  return (
    <div className="mx-4 shrink-0 rounded-[28px] border border-white/[0.07] bg-white/[0.035] p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      {/* ---------------- Temps / mesure ---------------- */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/40">
            Temps / mesure
          </p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold leading-none tracking-tight">
              {beats}
            </span>
            <span className="text-xs text-white/40">temps par mesure</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StepButton
            label="Moins de temps par mesure"
            onClick={() => onBeatsChange(beats - 1)}
            disabled={beats <= 1}
          >
            <Minus className="size-4" />
          </StepButton>
          <StepButton
            label="Plus de temps par mesure"
            onClick={() => onBeatsChange(beats + 1)}
            disabled={beats >= 12}
          >
            <Plus className="size-4" />
          </StepButton>
        </div>
      </div>

      <div className="my-4 h-px bg-white/[0.06]" />

      {/* ---------------- BPM ---------------- */}
      <div className="flex items-end justify-between">
        <p className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.28em] text-white/40">
          Tempo
        </p>
        <p className="flex items-baseline gap-1.5">
          <span
            className={`font-display text-4xl font-semibold leading-none tracking-tight transition-colors duration-300 ${
              playing ? "text-orange-300" : "text-white"
            }`}
          >
            {bpm}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
            bpm
          </span>
        </p>
      </div>

      <input
        type="range"
        min={minBpm}
        max={maxBpm}
        value={bpm}
        aria-label="Tempo en battements par minute"
        onChange={(e) => onBpmChange(Number(e.target.value))}
        className="tempo-range mt-3"
        style={{
          background: `linear-gradient(90deg, #ff8a1e 0%, #ffc24b ${progress}%, rgba(255,255,255,0.08) ${progress}%)`,
        }}
      />
      <div className="mt-1.5 flex justify-between text-[10px] font-medium tracking-wider text-white/30">
        <span>{minBpm}</span>
        <span>{maxBpm}</span>
      </div>

      {/* Boutons d'ajustement rapide */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {quickSteps.map((step) => (
          <button
            key={step}
            type="button"
            aria-label={`${step > 0 ? "Augmenter" : "Diminuer"} le tempo de ${Math.abs(step)}`}
            onClick={() => onBpmChange(bpm + step)}
            className="rounded-xl border border-white/[0.08] bg-white/[0.05] py-2.5 text-sm font-semibold text-white/85 tabular-nums transition-all duration-150 hover:border-white/20 hover:bg-white/10 active:scale-95"
          >
            {step > 0 ? `+${step}` : `−${Math.abs(step)}`}
          </button>
        ))}
      </div>

      {/* ---------------- Marche / Arrêt ---------------- */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={playing}
        aria-label={playing ? "Arrêter le métronome" : "Démarrer le métronome"}
        className={`mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-bold uppercase tracking-[0.3em] transition-all duration-300 active:scale-[0.98] ${
          playing
            ? "border border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.11]"
            : "bg-gradient-to-r from-[#ff7a00] via-[#ff9b2e] to-[#ffc24b] text-black shadow-[0_14px_44px_-10px_rgba(255,138,30,0.55)] hover:brightness-110"
        }`}
      >
        {playing ? (
          <>
            <span className="flex h-4 items-end gap-[3px]" aria-hidden>
              <span className="eq-bar h-4 w-[3px] rounded-full bg-orange-400" style={{ animationDelay: "0s" }} />
              <span className="eq-bar h-4 w-[3px] rounded-full bg-yellow-300" style={{ animationDelay: "0.14s" }} />
              <span className="eq-bar h-4 w-[3px] rounded-full bg-orange-400" style={{ animationDelay: "0.28s" }} />
            </span>
            <Square className="size-4 fill-current" />
            Arrêt
          </>
        ) : (
          <>
            <Play className="size-4 fill-current" />
            Marche
          </>
        )}
      </button>
    </div>
  );
}
