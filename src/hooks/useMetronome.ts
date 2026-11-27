import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

const LOOKAHEAD_MS = 25; // fréquence du planificateur
const SCHEDULE_AHEAD_S = 0.12; // combien de temps on planifie à l'avance

/**
 * Moteur de métronome basé sur la Web Audio API.
 * Technique « A Tale of Two Clocks » : les clics sont planifiés sur
 * l'horloge audio (précision sous-milliseconde), tandis qu'une boucle
 * requestAnimationFrame synchronise le visuel sur ces mêmes instants.
 */
export function useMetronome(bpm: number, beatsPerMeasure: number, muted: boolean) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [tick, setTick] = useState(0); // compteur global de temps -> re-déclenche les animations

  const ctxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatInBarRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerMeasure);
  const mutedRef = useRef(muted);
  const visualQueueRef = useRef<{ beat: number; time: number }[]>([]);

  // Références toujours fraîches pour que le planificateur réagisse
  // instantanément aux changements de BPM / de signature pendant le jeu.
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const playClick = useCallback((beat: number, time: number) => {
    if (mutedRef.current) return; // mode muet : le visuel continue seul
    const ctx = ctxRef.current;
    if (!ctx) return;

    const accent = beat === 0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // 1er temps : plus aigu et plus fort (accent), les autres : plus doux
    const f = accent ? 1760 : 1174.66; // La6 / Ré6
    osc.frequency.setValueAtTime(f, time);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, time + 0.045);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !isPlayingRef.current) return;

    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beat = beatInBarRef.current;
      playClick(beat, nextNoteTimeRef.current);
      visualQueueRef.current.push({ beat, time: nextNoteTimeRef.current });
      nextNoteTimeRef.current += 60 / bpmRef.current;
      beatInBarRef.current = (beat + 1) % beatsRef.current;
    }
    timerRef.current = window.setTimeout(scheduler, LOOKAHEAD_MS);
  }, [playClick]);

  const visualLoop = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !isPlayingRef.current) return;

    const now = ctx.currentTime;
    const queue = visualQueueRef.current;
    while (queue.length > 0 && queue[0].time <= now) {
      const event = queue.shift()!;
      setCurrentBeat(event.beat);
      setTick((t) => t + 1);
    }
    rafRef.current = requestAnimationFrame(visualLoop);
  }, []);

  const start = useCallback(() => {
    if (isPlayingRef.current) return;

    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new AC();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    isPlayingRef.current = true;
    setIsPlaying(true);
    beatInBarRef.current = 0;
    setCurrentBeat(0);
    setTick(0);
    visualQueueRef.current = [];
    nextNoteTimeRef.current = ctx.currentTime + 0.09;

    try {
      navigator.vibrate?.(15);
    } catch {
      /* haptique non disponible : pas grave */
    }

    // Application native Android : garder l'écran allumé pendant le jeu
    // (géré côté natif via MainActivity.java — voir ci-dessous)
    if (Capacitor.isNativePlatform()) {
      try {
        // FLAG_KEEP_SCREEN_ON géré nativement dans MainActivity
        window.dispatchEvent(new CustomEvent("metronome-keep-awake", { detail: true }));
      } catch { /* silencieux */ }
    }

    scheduler();
    rafRef.current = requestAnimationFrame(visualLoop);
  }, [scheduler, visualLoop]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentBeat(0);
    visualQueueRef.current = [];
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Application native Android : redonner à l'écran le droit de s'éteindre
    if (Capacitor.isNativePlatform()) {
      try {
        window.dispatchEvent(new CustomEvent("metronome-keep-awake", { detail: false }));
      } catch { /* silencieux */ }
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) stop();
    else start();
  }, [start, stop]);

  // Nettoyage complet au démontage
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    };
  }, []);

  return { isPlaying, currentBeat, tick, start, stop, toggle };
}
