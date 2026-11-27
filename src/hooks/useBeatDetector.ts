import { useCallback, useRef, useState } from "react";

export interface BpmDataPoint {
  time: number;
  bpm: number;
}

/* ── Vote de tempo ── */
function voteBpm(intervals: number[]): number | null {
  if (intervals.length < 2) return null;
  const candidates: number[] = [];
  for (const iv of intervals) {
    const bpm = 60000 / iv;
    for (const mult of [1, 0.5, 2]) {
      const b = bpm * mult;
      if (b >= 40 && b <= 250) candidates.push(b);
    }
  }
  const bins = new Map<number, number>();
  for (const c of candidates) {
    const bin = Math.round(c / 2) * 2;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  let bestBin = 0, bestCount = 0;
  bins.forEach((count, bin) => { if (count > bestCount) { bestCount = count; bestBin = bin; } });
  let sum = 0, w = 0;
  for (const c of candidates) { if (Math.abs(c - bestBin) <= 6) { sum += c; w++; } }
  return w > 0 ? Math.round(sum / w) : bestBin;
}

function normalizeAroundReference(candidate: number, reference: number): number {
  if (!reference) return candidate;
  const options = [candidate, candidate * 2, candidate / 2];
  let best = options[0];
  let bestDist = Math.abs(options[0] - reference);
  for (const o of options.slice(1)) {
    const d = Math.abs(o - reference);
    if (d < bestDist && o >= 40 && o <= 250) {
      best = o;
      bestDist = d;
    }
  }
  return Math.round(best);
}

function stabilizeBpm(candidate: number, prev: number, anomalyCount: number): { bpm: number; anomalyCount: number } {
  if (!prev) return { bpm: candidate, anomalyCount: 0 };
  const diffRatio = Math.abs(candidate - prev) / prev;

  // Si l'écart est raisonnable (< 12%), on accepte directement avec lissage léger
  if (diffRatio <= 0.12) {
    return {
      bpm: Math.round(prev * 0.78 + candidate * 0.22),
      anomalyCount: 0,
    };
  }

  // Sinon, on considère ça comme une anomalie temporaire
  const nextAnomaly = anomalyCount + 1;

  // On n'accepte un vrai changement brutal que s'il se répète 3 fois de suite
  if (nextAnomaly >= 3) {
    return {
      bpm: Math.round(prev * 0.55 + candidate * 0.45),
      anomalyCount: 0,
    };
  }

  // Sinon on garde l'ancien tempo
  return {
    bpm: prev,
    anomalyCount: nextAnomaly,
  };
}

function encodeWavSlice(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const sr = buffer.sampleRate; const channels = buffer.numberOfChannels;
  const start = Math.max(0, Math.floor(startSec * sr)), end = Math.min(buffer.length, Math.ceil(endSec * sr));
  const frames = Math.max(0, end - start), blockAlign = channels * 2, dataSize = frames * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize), view = new DataView(wav);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); str(8, "WAVE"); str(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = start; i < end; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true); offset += 2;
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}



/* ── Hook Principal ── */
export function useBeatDetector(pointsPerSecond: number = 1) {
  const [isListening, setIsListening] = useState(false);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [history, setHistory] = useState<BpmDataPoint[]>([]);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  
  const beatTimesRef = useRef<number[]>([]);
  const energyHistRef = useRef<number[]>([]);
  const lastBeatRef = useRef(0);
  const latestRmsRef = useRef(0);
  const smoothedBpmRef = useRef(0);
  const anomalyCountRef = useRef(0);
  const decodedRef = useRef<AudioBuffer | null>(null);

  const playSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playTickRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setCurrentBpm(0); setHistory([]); setDuration(0); setAudioBlob(null); setPlaybackPosition(null);
    setError(null); setInputLevel(0); setIsPlayingBack(false);
    beatTimesRef.current = []; energyHistRef.current = [];
    lastBeatRef.current = 0; latestRmsRef.current = 0; smoothedBpmRef.current = 0; anomalyCountRef.current = 0;
    decodedRef.current = null; chunksRef.current = [];
    if (playTickRef.current) clearInterval(playTickRef.current);
  }, []);

  const runAnalysisOnBuffer = useCallback((buf: AudioBuffer) => {
    const data = buf.getChannelData(0); const sr = buf.sampleRate;
    const onsets: number[] = []; const eHist: number[] = []; const newHistory: BpmDataPoint[] = [];
    const stepSamples = Math.max(512, Math.round(sr / pointsPerSecond));
    let lastB = 0;
    for (let p = 0; p < data.length - 2048; p += 1024) {
      let sum = 0; for (let i = 0; i < 2048; i++) sum += data[p+i] * data[p+i];
      const rms = Math.sqrt(sum/2048);
      eHist.push(rms); if (eHist.length > 150) eHist.shift();
      const avg = eHist.reduce((a,b)=>a+b,0)/eHist.length;
      const timeMs = (p/sr)*1000;
      if (rms > Math.max(avg * 1.4, 0.015) && (onsets.length === 0 || timeMs - onsets[onsets.length-1] > 230)) { onsets.push(timeMs); }
        if (p % stepSamples < 1024) {
          const recent = onsets.filter(t => t > timeMs - 8000);
          if (recent.length >= 3) {
            const ivs = recent.slice(1).map((t,i)=>t-recent[i]);
            let bpm = voteBpm(ivs);
            if (bpm) {
              bpm = normalizeAroundReference(bpm, lastB || bpm);
              const stable = stabilizeBpm(bpm, lastB, anomalyCountRef.current);
              lastB = stable.bpm;
              anomalyCountRef.current = stable.anomalyCount;
              newHistory.push({ time: p/sr, bpm: lastB });
            }
          }
        }
    }
    setHistory(newHistory); setDuration(buf.duration); decodedRef.current = buf;
  }, [pointsPerSecond]);

  const start = useCallback(async () => {
    setError(null); reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); ctxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      const source = ctx.createMediaStreamSource(stream);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 250;
      source.connect(lp); lp.connect(analyser);
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 }); recorderRef.current = recorder;
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data); recorder.start(100);
      startTimeRef.current = performance.now(); setIsListening(true);
      const buf = new Float32Array(analyser.fftSize);
      const loop = () => {
        if (!ctxRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length); latestRmsRef.current = rms;
        energyHistRef.current.push(rms); if (energyHistRef.current.length > 150) energyHistRef.current.shift();
        const avg = energyHistRef.current.reduce((a,b)=>a+b,0) / energyHistRef.current.length;
        const now = performance.now();
        if (rms > Math.max(avg * 1.4, 0.015) && now - lastBeatRef.current > 230) { lastBeatRef.current = now; beatTimesRef.current.push(now); }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      const analysisMs = Math.max(100, Math.round(1000 / pointsPerSecond));
      timersRef.current.push(window.setInterval(() => {
        const now = performance.now();
        const recent = beatTimesRef.current.filter(t => t > now - 8000);
        if (recent.length >= 3) {
          const ivs = recent.slice(1).map((t, i) => t - recent[i]);
          let bpm = voteBpm(ivs);
          if (bpm) {
            bpm = normalizeAroundReference(bpm, smoothedBpmRef.current || bpm);
            const stable = stabilizeBpm(bpm, smoothedBpmRef.current, anomalyCountRef.current);
            smoothedBpmRef.current = stable.bpm;
            anomalyCountRef.current = stable.anomalyCount;
            setCurrentBpm(stable.bpm);
            setHistory(h => [...h, { time: (now - startTimeRef.current)/1000, bpm: stable.bpm }]);
          }
        }
      }, analysisMs));
      timersRef.current.push(window.setInterval(() => setDuration((performance.now()-startTimeRef.current)/1000), 200));
      timersRef.current.push(window.setInterval(() => setInputLevel(Math.max(0, Math.min(1, latestRmsRef.current*20))), 80));
    } catch { setError("Microphone non disponible."); setIsListening(false); }
  }, [reset, pointsPerSecond]);

  const stop = useCallback(() => {
    setIsListening(false); if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timersRef.current.forEach(t => clearInterval(t)); timersRef.current = [];
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current!.onstop = () => setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorderRef.current!.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop()); ctxRef.current?.close(); ctxRef.current = null;
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    reset();
    try {
      const ab = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(ab);
      runAnalysisOnBuffer(buf); setAudioBlob(file);
    } catch { setError("Erreur d'analyse du fichier."); }
  }, [reset, runAnalysisOnBuffer]);

  const reanalyze = useCallback(async () => {
    if (decodedRef.current) runAnalysisOnBuffer(decodedRef.current);
    else if (audioBlob) {
      const ab = await audioBlob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(ab); runAnalysisOnBuffer(buf);
    }
  }, [audioBlob, runAnalysisOnBuffer]);

  const downloadWav = useCallback(async (s0: number, s1: number) => {
    if (!decodedRef.current && audioBlob) {
      const ab = await audioBlob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      decodedRef.current = await ctx.decodeAudioData(ab);
    }
    if (!decodedRef.current) return null;
    return encodeWavSlice(decodedRef.current, s0, s1);
  }, [audioBlob]);

  const playSelection = useCallback(async (s0: number, s1: number) => {
    if (playSourceRef.current) playSourceRef.current.stop();
    if (!decodedRef.current && audioBlob) {
      const ab = await audioBlob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      decodedRef.current = await ctx.decodeAudioData(ab);
    }
    if (!decodedRef.current) return;
    const pctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    playCtxRef.current = pctx; const src = pctx.createBufferSource();
    src.buffer = decodedRef.current; src.connect(pctx.destination);
    setIsPlayingBack(true); setPlaybackPosition(s0);
    const startPerf = performance.now();
    src.start(0, s0, s1 - s0); playSourceRef.current = src;
    playTickRef.current = window.setInterval(() => setPlaybackPosition(s0 + (performance.now()-startPerf)/1000), 40);
    src.onended = () => { setIsPlayingBack(false); setPlaybackPosition(null); if(playTickRef.current) clearInterval(playTickRef.current); };
  }, [audioBlob]);

  return {
    isListening, currentBpm, history, duration, audioBlob, isPlayingBack, playbackPosition, error, inputLevel,
    start, stop, reset, analyzeFile, reanalyze, downloadWav, playSelection, stopPlayback: () => playSourceRef.current?.stop()
  };
}
