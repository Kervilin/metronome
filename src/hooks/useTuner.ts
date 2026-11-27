import { useCallback, useRef, useState } from "react";

export interface TunerData {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  targetFreq: number;
  isInTune: boolean;
  hasSignal: boolean;
}

export interface ChordData {
  notes: string[];
  name: string;
  root: string;
  quality: string;
}

export interface FreqPoint {
  time: number;
  freq: number;
}

const NOTE_NAMES = ["Do","Do#","Ré","Ré#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];
const A4 = 440;

function freqToNote(freq: number) {
  const st = 12 * Math.log2(freq / A4);
  const r = Math.round(st);
  const cents = Math.round((st - r) * 100);
  const midi = 69 + r;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const target = A4 * Math.pow(2, r / 12);
  return { note: NOTE_NAMES[noteIndex], noteIndex, octave, cents, targetFreq: Math.round(target * 100) / 100 };
}

function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  const minLag = Math.floor(sampleRate / 1200);
  const maxLag = Math.min(Math.floor(SIZE / 2), Math.floor(sampleRate / 55));
  const diff = new Float32Array(maxLag);
  for (let tau = minLag; tau < maxLag; tau++) {
    let sum = 0; for (let i = 0; i < SIZE - tau; i++) { const d = buf[i] - buf[i + tau]; sum += d * d; }
    diff[tau] = sum;
  }
  const cmndf = new Float32Array(maxLag); cmndf[0] = 1; let cumSum = 0;
  for (let tau = minLag; tau < maxLag; tau++) { cumSum += diff[tau]; cmndf[tau] = cumSum > 0 ? diff[tau] * tau / cumSum : 1; }
  const threshold = 0.15; let bestLag = 0;
  for (let tau = minLag; tau < maxLag - 1; tau++) {
    if (cmndf[tau] < threshold) { while (tau + 1 < maxLag && cmndf[tau + 1] < cmndf[tau]) tau++; bestLag = tau; break; }
  }
  if (bestLag === 0) {
    let minVal = Infinity;
    for (let tau = minLag; tau < maxLag; tau++) { if (cmndf[tau] < minVal) { minVal = cmndf[tau]; bestLag = tau; } }
    if (minVal > 0.4) return null;
  }
  if (bestLag <= 0 || bestLag >= maxLag - 1) return null;
  const y0 = cmndf[bestLag - 1], y1 = cmndf[bestLag], y2 = cmndf[bestLag + 1];
  const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
  const freq = sampleRate / (bestLag + (isFinite(shift) ? shift : 0));
  return freq >= 55 && freq <= 1200 ? freq : null;
}

/* ───────────── Filtre de reconnaissance d'accord ─────────────
   UNE SEULE détection est utilisée dans l'application : l'accordéon
   DIATONIQUE. Aucun sélecteur n'est affiché, ces paramètres sont figés.

   Les 6 paramètres :
   · loHz/hiHz — bande passante des fondamentales retenues
   · rel       — seuil en dB SOUS le pic le plus fort (grand = sensible)
   · floor     — plancher absolu en dB (rejette le bruit mécanique du bouton)
   · merge     — fusion des pics voisins (fraction ; 0 = désactivé)
   · tol       — tolérance du rejet harmonique (inharmonicité de l'anche)
   · limit     — nombre maximal de notes gardées pour identifier l'accord

   Diatonique = PEU DE VIBRATO : pas de tremolo marqué, les anches sont quasi à
   l'unisson → fusion SERRE (0,9 %) : on absorbe un vibrato léger sans jamais le
   prendre pour une seconde note. Anches propres → tolérance harmonique fine
   (4,5 %) et plancher à −66 dB, la mécanique du bouton étant plus discrète
   que celle d'un musette.                                                */
interface PeakFilter {
  loHz: number; hiHz: number; rel: number; floor: number; merge: number; tol: number; limit: number;
}

const DIATO_FILTER: PeakFilter = {
  loHz: 65, hiHz: 1500, rel: 24, floor: -66, merge: 0.009, tol: 0.045, limit: 5,
};

/**
 * Fréquence du pic spectral, avec INTERPOLATION PARABOLIQUE.
 * L'AnalyserNode renvoie des BINS : sans interpolation, le sommet lu est arrondi
 * au bin le plus proche et, sur les graves où un bin vaut plusieurs demi-tons,
 * la note tombe sur le demi-ton voisin (« Ré » lu « Ré# », « Sol » lu « Fa# »).
 * L'interpolation sur les 3 bins du sommet donne une précision sous-bin.
 */
function detectPeakFreqs(freqData: Float32Array, sampleRate: number, fftSize: number): { freq: number; db: number }[] {
  const f = DIATO_FILTER;
  const binHz = sampleRate / fftSize;

  const minBin = Math.max(1, Math.floor(f.loHz / binHz));
  const maxBin = Math.min(freqData.length - 2, Math.floor(f.hiHz / binHz));
  if (maxBin <= minBin) return [];

  let maxDb = -Infinity;
  for (let i = minBin; i < maxBin; i++) if (freqData[i] > maxDb) maxDb = freqData[i];
  if (!isFinite(maxDb)) return [];

  const threshold = Math.max(maxDb - f.rel, f.floor);

  const peaks: { freq: number; db: number }[] = [];
  for (let i = minBin; i <= maxBin; i++) {
    const y1 = freqData[i];
    if (y1 <= threshold) continue;
    // « >= » à gauche : un plateau de deux bins égaux ne doit pas faire
    // disparaître la note (l'ancien test strict les rejetait tous les deux).
    if (!(y1 >= freqData[i - 1] && y1 > freqData[i + 1])) continue;
    const y0 = freqData[i - 1], y2 = freqData[i + 1];
    const den = y0 - 2 * y1 + y2;
    const raw = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
    const delta = isFinite(raw) ? Math.max(-0.5, Math.min(0.5, raw)) : 0;
    peaks.push({ freq: (i + delta) * binHz, db: y1 });
  }
  peaks.sort((a, b) => b.db - a.db);

  // ── Fusion des pics voisins (unisson des anches diatoniques) ──
  // Deux anches quasi à l'unisson donnent deux pics voisins : on ne garde que
  // le plus fort pour ne pas fabriquer une fausse note.
  if (f.merge > 0 && peaks.length > 1) {
    const merged: typeof peaks = [];
    for (const p of peaks) {
      const dup = merged.findIndex(m => Math.abs(p.freq - m.freq) / m.freq < f.merge);
      if (dup === -1) merged.push(p);
      else if (p.db > merged[dup].db) merged[dup] = p;
    }
    return filterHarmonics(merged, f.tol);
  }

  return filterHarmonics(peaks, f.tol);
}

/** Écart en demi-tons entre deux fréquences. */
const semitoneGap = (a: number, b: number) => 12 * Math.abs(Math.log2(a / b));

/** Rejet harmonique : on ne garde que les fondamentales indépendantes. */
function filterHarmonics(peaks: { freq: number; db: number }[], tol: number): { freq: number; db: number }[] {
  const fundamentals: { freq: number; db: number }[] = [];
  for (const p of peaks) {
    let isHarmonic = false;
    for (const fund of fundamentals) {
      for (const mult of [2, 3, 4, 5, 6]) {
        if (Math.abs(p.freq - fund.freq * mult) / (fund.freq * mult) < tol) { isHarmonic = true; break; }
      }
      if (isHarmonic) break;
    }
    if (!isHarmonic) fundamentals.push(p);
  }
  return fundamentals;
}

/**
 * Fusionne tout ce qui désigne en réalité LA MÊME note.
 * Deux fréquences à moins de 0,9 ton l'un de l'autre ne peuvent pas être deux
 * notes distinctes (un demi-ton réel vaut 1,0 ton) : c'est le même lobe spectral,
 * ou un pic FFT tombé sur le demi-ton voisin de la note déjà trouvée par
 * autocorrélation. L'entrée la plus forte l'emporte.
 * → corrige « Ré + Ré# alors qu'il n'y a que Ré » et « Fa# + Sol alors qu'il n'y a que Sol ».
 */
function mergeSameNote(items: { freq: number; db: number }[]): { freq: number; db: number }[] {
  const sorted = [...items].sort((a, b) => b.db - a.db);
  const out: { freq: number; db: number }[] = [];
  for (const it of sorted) {
    if (it.freq > 0 && !out.some(o => semitoneGap(it.freq, o.freq) < 0.9)) out.push(it);
  }
  return out;
}

/* Répertoire d'accords — du plus simple au plus riche.
   Les intervalles sont TRIÉS croissants et normalisés dans l'octave.
   Le scoring privilégie les formes qui expliquent TOUTES les notes jouées :
   Do Mi La Si → « Lam(add9) » (4 notes expliquées) plutôt que « Mi sus4 » (3/4). */
const CHORDS: { iv: number[]; q: string }[] = [
  // ── Triades ──
  { iv: [0,4,7], q: "majeur" }, { iv: [0,3,7], q: "mineur" },
  { iv: [0,5,7], q: "sus4" },   { iv: [0,2,7], q: "sus2" },
  { iv: [0,4,8], q: "aug" },    { iv: [0,3,6], q: "dim" },
  // ── Quatre notes : septièmes ──
  { iv: [0,4,7,10], q: "7" }, { iv: [0,3,7,10], q: "m7" }, { iv: [0,4,7,11], q: "Maj7" },
  { iv: [0,3,6,9], q: "dim7" }, { iv: [0,3,6,10], q: "m7♭5" }, { iv: [0,5,7,10], q: "7sus4" },
  // ── Quatre notes : « add9 » et « 6 » — les plus courants en pratique ──
  { iv: [0,2,3,7], q: "m(add9)" },  // Lam9 : La Do Mi Si
  { iv: [0,2,4,7], q: "add9" },     // Doadd9 : Do Ré Mi Sol
  { iv: [0,4,7,9], q: "6" },        // Do6 : Do Mi Sol La
  { iv: [0,3,7,9], q: "m6" },       // Lam6 : La Do Mi Fa#
  // ── Cinq notes : neuvièmes ──
  { iv: [0,2,4,7,10], q: "9" },     // Do9
  { iv: [0,2,3,7,10], q: "m9" },    // Lam9 complet : La Do Mi Sol Si
];

function identifyChord(noteIndices: number[]): ChordData | null {
  if (noteIndices.length < 2) return null;
  const unique = [...new Set(noteIndices)];
  const lowest = Math.min(...unique);
  const cands: { root: number; q: string; score: number; len: number }[] = [];
  for (const root of unique) {
    const ivs = unique.map(n => ((n - root) + 12) % 12);
    for (const ch of CHORDS) {
      const matched = ch.iv.filter(x => ivs.includes(x)).length;
      if (matched < ch.iv.length) continue;
      const extra = ivs.filter(x => !ch.iv.includes(x)).length;
      const score = matched * 10 - extra;
      cands.push({ root, q: ch.q, score, len: ch.iv.length });
    }
  }
  if (cands.length === 0) return null;

  let best = cands[0];
  for (const c of cands) {
    if (c.score !== best.score) { if (c.score > best.score) best = c; continue; }
    // ── Égalité de score → on cherche l'accord le PLUS SIMPLE et le plus
    // lisible : d'abord la racine la plus grave, puis la forme à moins de notes.
    const cBass = c.root === lowest, bBass = best.root === lowest;
    if (cBass !== bBass) { if (cBass) best = c; continue; }
    if (c.len < best.len) best = c;
  }

  // ── FILTRE « basse = tonique » (main gauche Stradella) ──
  // Sur un accordéon, la basse porte l'accord : la note la plus grave est la
  // tonique. On ne retient que les candidats dont la racine = note la plus grave ;
  // si aucun, on garde le meilleur candidat global (cas d'une mélodie en main droite).
  {
    const onBass = cands.filter(c => c.root === lowest);
    if (onBass.length > 0) {
      let onBest = onBass[0];
      for (const c of onBass) {
        if (c.score !== onBest.score) { if (c.score > onBest.score) onBest = c; continue; }
        if (c.len < onBest.len) onBest = c;
      }
      best = onBest;
    }
  }

  // Notes affichées du grave à l'aigu (plus lisible pour un accordéon)
  const ordered = [...unique].sort((a, b) => a - b);
  return { notes: ordered.map(i => NOTE_NAMES[i]), root: NOTE_NAMES[best.root], quality: best.q, name: `${NOTE_NAMES[best.root]} ${best.q}` };
}

export function useTuner() {
  const [isActive,    setIsActive]    = useState(false);
  const [data,        setData]        = useState<TunerData | null>(null);
  const [chord,       setChord]       = useState<ChordData | null>(null);
  const [freqHistory, setFreqHistory] = useState<FreqPoint[]>([]);
  const [error,       setError]       = useState<string | null>(null);

  const ctxRef     = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const histRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const freqRef = useRef(0);
  const smoothRef = useRef(0);
  const lockedRef = useRef<TunerData | null>(null);
  const silRef = useRef(0);

  // N° de session : invalide les boucles / flux d'une ouverture précédente
  // (démarrage asynchrone + démontage rapide = fuites de micro et boucles fantômes)
  const sessionRef = useRef(0);
  const signalLostRef = useRef(false);
  const [level, setLevel] = useState(0); // niveau micro (0..1) pour le VU-mètre

  // Pour stabiliser l'affichage des accords
  const chordHistoryRef = useRef<string[]>([]);
  const lastValidChordRef = useRef<ChordData | null>(null);

  const reset = useCallback(() => {
    freqRef.current = 0; smoothRef.current = 0; silRef.current = 0; lockedRef.current = null;
    chordHistoryRef.current = []; lastValidChordRef.current = null;
  }, []);

  /* ── stop() doit être DÉFINI AVANT start() : start en dépend ── */
  const stop = useCallback(() => {
    sessionRef.current++; // coupe toute boucle / session en cours
    setIsActive(false);
    setLevel(0);
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (histRef.current !== null) { clearInterval(histRef.current); histRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    const c = ctxRef.current; ctxRef.current = null;
    if (c && c.state !== "closed") c.close().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    stop(); // referme d'abord une éventuelle session précédente (fuite de micro)
    const session = sessionRef.current;
    setError(null); setData(null); setChord(null); setFreqHistory([]); setLevel(0); reset();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Micro indisponible : la page doit être servie en HTTPS.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      if (sessionRef.current !== session) return;
      const name = (e as DOMException | undefined)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Accès au micro refusé. Autorisez le microphone, puis réessayez."
          : name === "NotFoundError"
            ? "Aucun microphone détecté sur cet appareil."
            : "Microphone non disponible."
      );
      return;
    }

    // L'utilisateur a quitté l'écran pendant la demande de permission : on libère.
    if (sessionRef.current !== session) { stream.getTracks().forEach(t => t.stop()); return; }
    streamRef.current = stream;

    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(); ctxRef.current = ctx;

    // ───────────── POINT ESSENTIEL ─────────────
    // Sans resume(), l'AudioContext reste « suspended » (politique d'autoplay,
    // iframe intégrée) : les AnalyserNode ne traitent rien, le rms vaut toujours
    // 0 → la boucle reste dans la branche silence → l'accordeur n'écoute rien.
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* relancé au prochain geste */ } }
    if (sessionRef.current !== session || ctxRef.current !== ctx) {
      stream.getTracks().forEach(t => t.stop());
      if (ctx.state !== "closed") ctx.close().catch(() => undefined);
      return;
    }

    const source = ctx.createMediaStreamSource(stream);

    const anPitch = ctx.createAnalyser();
    anPitch.fftSize = 4096; // suffit : maxLag est déjà borné à sampleRate/55 (≈872)
    anPitch.smoothingTimeConstant = 0; // Pas de mélange pour la note
    source.connect(anPitch);

    const anChord = ctx.createAnalyser();
    anChord.fftSize = 8192;
    anChord.smoothingTimeConstant = 0.1; // Très peu de mélange, évite que les accords "bavent"
    source.connect(anChord);

      startRef.current = performance.now(); setIsActive(true);
      const timeBuf = new Float32Array(anPitch.fftSize);
      const freqBuf = new Float32Array(anChord.frequencyBinCount);

      let lastUi = 0;
      const loop = () => {
        if (sessionRef.current !== session || ctxRef.current !== ctx) return;
        anPitch.getFloatTimeDomainData(timeBuf);
        let rms = 0; for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
        rms = Math.sqrt(rms / timeBuf.length);

        // UI limitée à ~18 fps : React ne redessine plus 60 fois par seconde
        const due = performance.now() - lastUi >= 55;
        if (due) { lastUi = performance.now(); setLevel(Math.min(1, rms * 7)); }

        if (rms < 0.012) {
          silRef.current++;
          if (due && silRef.current >= 8 && lockedRef.current && !signalLostRef.current) {
            signalLostRef.current = true;
            setData({ ...lockedRef.current, hasSignal: false });
          }
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        signalLostRef.current = false;
        silRef.current = 0;
        const freq = detectPitch(timeBuf, ctx.sampleRate);
        if (freq) {
          const sm = smoothRef.current === 0 ? freq : smoothRef.current * 0.82 + freq * 0.18;
          smoothRef.current = sm; freqRef.current = sm;
          const info = freqToNote(sm);
          const td: TunerData = { frequency: Math.round(sm * 10) / 10, note: info.note, octave: info.octave, cents: info.cents, targetFreq: info.targetFreq, isInTune: Math.abs(info.cents) <= 5, hasSignal: true };
          lockedRef.current = td; if (due) setData(td);

          anChord.getFloatFrequencyData(freqBuf);
          // La note monophonique (autocorrélation, précision sous-bin) fait foi :
          // poussée en tête avec le niveau maximum, mergeSameNote lui donne la
          // priorité sur un pic FFT qui serait tombé sur le demi-ton voisin.
          const cand = detectPeakFreqs(freqBuf, ctx.sampleRate, anChord.fftSize);
          cand.push({ freq: sm, db: Infinity });
          const finalFreqs = mergeSameNote(cand);
          const finalNotes = [...new Set(
            finalFreqs.slice(0, DIATO_FILTER.limit).map(p => freqToNote(p.freq).noteIndex)
          )];
          
          let currentFrameChordName = "none";
          let currentFrameChordData: ChordData | null = null;
          if (finalNotes.length >= 2) {
            currentFrameChordData = identifyChord(finalNotes);
            currentFrameChordName = currentFrameChordData?.name || "none";
          }

          chordHistoryRef.current.push(currentFrameChordName);
          if (chordHistoryRef.current.length > 15) chordHistoryRef.current.shift();
          const counts: Record<string, number> = {}; let maxCount = 0; let winner = "none";
          for (const name of chordHistoryRef.current) { counts[name] = (counts[name] || 0) + 1; if (counts[name] > maxCount) { maxCount = counts[name]; winner = name; } }

          if (winner !== "none" && maxCount >= 9) {
            if (winner === currentFrameChordName) { setChord(currentFrameChordData); lastValidChordRef.current = currentFrameChordData; }
            else if (lastValidChordRef.current && lastValidChordRef.current.name === winner) { setChord(lastValidChordRef.current); }
          } else if (winner === "none" && maxCount >= 10) {
            setChord(null); lastValidChordRef.current = null;
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      histRef.current = window.setInterval(() => {
        if (sessionRef.current !== session) return;
        if (freqRef.current > 0) {
          const t = (performance.now() - startRef.current) / 1000;
          setFreqHistory(h => { const n = [...h, { time: t, freq: freqRef.current }]; return n.length > 500 ? n.slice(-500) : n; });
        }
      }, 200);
  }, [reset, stop]);

  // Filet de sécurité : certains environnements (autoplay strict) laissent
  // l'AudioContext « suspended » — on le relance au premier geste utilisateur.
  const resume = useCallback(() => {
    const c = ctxRef.current;
    if (c && c.state === "suspended") c.resume().catch(() => undefined);
  }, []);

  const diapasonRef = useRef<{ osc: OscillatorNode; gain: GainNode; ctx: AudioContext } | null>(null);
  const [diapasonOn, setDiapasonOn] = useState(false);
  const toggleDiapason = useCallback(() => {
    if (diapasonRef.current) {
      diapasonRef.current.gain.gain.exponentialRampToValueAtTime(0.0001, diapasonRef.current.ctx.currentTime + 0.3);
      setTimeout(() => { diapasonRef.current?.osc.stop(); diapasonRef.current?.ctx.close(); diapasonRef.current = null; }, 400);
      setDiapasonOn(false);
    } else {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 440; gain.gain.value = 0.3;
      osc.connect(gain); gain.connect(ctx.destination); osc.start();
      diapasonRef.current = { osc, gain, ctx }; setDiapasonOn(true);
    }
  }, []);

  return { isActive, data, chord, freqHistory, error, level, start, stop, resume, diapasonOn, toggleDiapason };
}
