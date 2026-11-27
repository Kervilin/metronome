import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Download, FolderOpen, Mic, Play, RotateCcw, Square, X } from "lucide-react";
import { useBeatDetector, type BpmDataPoint } from "../hooks/useBeatDetector";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1)}`;
}

function findNearest(pts: BpmDataPoint[], t: number): BpmDataPoint | null {
  if (!pts.length) return null;
  return pts.reduce((best, p) =>
    Math.abs(p.time - t) < Math.abs(best.time - t) ? p : best
  );
}

interface DrawParams {
  history: BpmDataPoint[];
  avgHistory: BpmDataPoint[];  // courbe moyenne rouge
  vMin: number; vMax: number;
  bMin: number; bMax: number;
  cursor: number | null;
  sel: { start: number; end: number } | null;
  live: boolean;
  elapsed: number;
  playbackPosition: number | null;
}

function draw(canvas: HTMLCanvasElement, p: DrawParams) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext("2d")!; g.scale(dpr, dpr);
  const ML = 50, MR = 12, MT = 20, MB = 30;
  const PW = W - ML - MR, PH = H - MT - MB;
  const tX = (t: number) => ML + ((t - p.vMin) / (p.vMax - p.vMin)) * PW;
  const bY = (b: number) => MT + (1 - (b - p.bMin) / (p.bMax - p.bMin)) * PH;

  g.fillStyle = "#0d0d14"; g.fillRect(0, 0, W, H);

  // Grille BPM
  const bStep = p.bMax - p.bMin > 80 ? 20 : p.bMax - p.bMin > 40 ? 10 : 5;
  g.font = "10px 'Space Grotesk', sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  for (let b = Math.ceil(p.bMin / bStep) * bStep; b <= p.bMax; b += bStep) {
    const y = bY(b); g.strokeStyle = "rgba(255,255,255,0.06)";
    g.beginPath(); g.moveTo(ML, y); g.lineTo(ML + PW, y); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillText(`${b}`, ML - 8, y);
  }

  // Grille temps
  const range = p.vMax - p.vMin;
  const tStep = range > 120 ? 30 : range > 60 ? 15 : range > 20 ? 5 : range > 8 ? 2 : 1;
  g.textAlign = "center"; g.textBaseline = "top";
  for (let t = Math.ceil(p.vMin / tStep) * tStep; t <= p.vMax; t += tStep) {
    const x = tX(t); if (x < ML || x > ML + PW) continue;
    g.strokeStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.moveTo(x, MT); g.lineTo(x, MT + PH); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillText(formatTime(t), x, MT + PH + 6);
  }

  if (p.history.length < 2) return;

  // Sélection
  if (p.sel) {
    const x1 = Math.max(ML, tX(p.sel.start)), x2 = Math.min(ML + PW, tX(p.sel.end));
    g.fillStyle = "rgba(255,138,30,0.15)"; g.fillRect(x1, MT, x2 - x1, PH);
    g.strokeStyle = "rgba(255,138,30,0.5)"; g.lineWidth = 1; g.setLineDash([4, 4]); g.strokeRect(x1, MT, x2 - x1, PH); g.setLineDash([]);
  }

  // ── Courbe BPM orange (temps réel) ──
  g.beginPath();
  p.history.forEach((pt, i) => { const x = tX(pt.time), y = bY(pt.bpm); i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
  const last = p.history[p.history.length - 1];
  g.lineTo(tX(last.time), MT + PH); g.lineTo(tX(p.history[0].time), MT + PH); g.closePath();
  const grad = g.createLinearGradient(0, MT, 0, MT + PH);
  grad.addColorStop(0, "rgba(255,138,30,0.2)"); grad.addColorStop(1, "rgba(255,138,30,0.01)");
  g.fillStyle = grad; g.fill();
  g.save(); g.shadowColor = "#ff8a1e"; g.shadowBlur = 10; g.beginPath();
  p.history.forEach((pt, i) => { const x = tX(pt.time), y = bY(pt.bpm); i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); });
  g.strokeStyle = "#ff8a1e"; g.lineWidth = 2; g.lineJoin = "round"; g.stroke(); g.restore();
  p.history.forEach((pt) => { g.beginPath(); g.arc(tX(pt.time), bY(pt.bpm), 2.5, 0, Math.PI * 2); g.fillStyle = "#ffd60a"; g.fill(); });

  // ── Courbe moyenne rouge (grandit toutes les N secondes) ──
  if (p.avgHistory.length >= 2) {
    g.save();
    g.shadowColor = "#ff3030"; g.shadowBlur = 8;
    g.beginPath();
    p.avgHistory.forEach((pt, i) => {
      const x = tX(pt.time), y = bY(pt.bpm);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.strokeStyle = "#ff4444"; g.lineWidth = 2.5; g.lineJoin = "round"; g.stroke();
    g.restore();
    // Points rouges
    p.avgHistory.forEach((pt) => {
      g.beginPath(); g.arc(tX(pt.time), bY(pt.bpm), 3.5, 0, Math.PI * 2);
      g.fillStyle = "#ff3030"; g.fill();
    });
    // Légende
    g.font = "9px 'Space Grotesk', sans-serif"; g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "#ff6666"; g.fillText("— moy.", ML + 4, MT + 3);
  }

  // Curseur lecture live
  if (p.live) { const cx = tX(p.elapsed); if (cx >= ML && cx <= ML + PW) { g.strokeStyle = "rgba(255,80,80,0.7)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, MT); g.lineTo(cx, MT + PH); g.stroke(); } }

  // Curseur lecture playback
  if (p.playbackPosition !== null && !p.live) {
    const px = tX(p.playbackPosition);
    if (px >= ML && px <= ML + PW) {
      g.strokeStyle = "rgba(255,214,10,0.95)"; g.lineWidth = 2; g.beginPath(); g.moveTo(px, MT); g.lineTo(px, MT + PH); g.stroke();
      g.beginPath(); g.arc(px, MT + 8, 5, 0, Math.PI * 2); g.fillStyle = "#ffd60a"; g.fill();
    }
  }

  // Tooltip curseur
  if (p.cursor !== null && !p.live) {
    const cx = tX(p.cursor); if (cx >= ML && cx <= ML + PW) {
      const pt = findNearest(p.history, p.cursor);
      if (pt) {
        const nx = tX(pt.time), ny = bY(pt.bpm);
        g.strokeStyle = "rgba(255,255,255,0.4)"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, MT); g.lineTo(cx, MT + PH); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(nx, ny, 6, 0, Math.PI * 2); g.fillStyle = "rgba(255,214,10,0.3)"; g.fill();
        g.beginPath(); g.arc(nx, ny, 4, 0, Math.PI * 2); g.fillStyle = "#ffd60a"; g.fill();
        const l1 = `${pt.bpm} BPM`, l2 = formatTime(pt.time);
        g.font = "bold 13px 'Space Grotesk', sans-serif";
        const tw = Math.max(g.measureText(l1).width, g.measureText(l2).width);
        const bw = tw + 20, bh = 48; let bx = nx - bw / 2, by = ny - bh - 12;
        if (by < 4) by = ny + 12; bx = Math.max(4, Math.min(W - bw - 4, bx));
        const r = 8; g.fillStyle = "rgba(20,20,30,0.95)"; g.strokeStyle = "rgba(255,138,30,0.5)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(bx+r, by); g.lineTo(bx+bw-r, by); g.quadraticCurveTo(bx+bw, by, bx+bw, by+r); g.lineTo(bx+bw, by+bh-r); g.quadraticCurveTo(bx+bw, by+bh, bx+bw-r, by+bh); g.lineTo(bx+r, by+bh); g.quadraticCurveTo(bx, by+bh, bx, by+bh-r); g.lineTo(bx, by+r); g.quadraticCurveTo(bx, by, bx+r, by); g.closePath(); g.fill(); g.stroke();
        g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffd60a"; g.font = "bold 13px 'Space Grotesk', sans-serif"; g.fillText(l1, bx+bw/2, by+17);
        g.fillStyle = "rgba(255,255,255,0.5)"; g.font = "11px 'Space Grotesk', sans-serif"; g.fillText(l2, bx+bw/2, by+34);
      }
    }
  }
}

export default function TempoAnalyzer({ onBack }: { onBack: () => void }) {
  const [pointsPerSec, setPointsPerSec] = useState(1);
  const [avgWindow, setAvgWindow] = useState(10); // fenêtre de moyenne en secondes
  const {
    isListening, currentBpm, history, duration, error, inputLevel, audioBlob, isPlayingBack, playbackPosition,
    start, stop, reset, playSelection, stopPlayback, reanalyze, downloadWav, analyzeFile
  } = useBeatDetector(pointsPerSec);

  // ── Courbe moyenne rouge : calculée toutes les avgWindow secondes ──
  const [avgHistory, setAvgHistory] = useState<BpmDataPoint[]>([]);
  const lastAvgTimeRef = useRef(0);

  // Réinitialiser la courbe moyenne quand on repart de zéro
  useEffect(() => {
    if (history.length === 0) {
      setAvgHistory([]);
      lastAvgTimeRef.current = 0;
    }
  }, [history.length]);

  // Ajouter un point de moyenne toutes les avgWindow secondes
  useEffect(() => {
    if (!isListening || history.length < 2) return;
    const lastPt = history[history.length - 1];
    if (lastPt.time - lastAvgTimeRef.current >= avgWindow) {
      // Calculer la moyenne des points de la fenêtre écoulée
      const windowStart = lastAvgTimeRef.current;
      const windowEnd = lastPt.time;
      const pts = history.filter(p => p.time >= windowStart && p.time <= windowEnd);
      if (pts.length > 0) {
        const avg = Math.round(pts.reduce((s, p) => s + p.bpm, 0) / pts.length);
        const midTime = (windowStart + windowEnd) / 2;
        setAvgHistory(h => [...h, { time: midTime, bpm: avg }]);
      }
      lastAvgTimeRef.current = lastPt.time;
    }
  }, [history, isListening, avgWindow]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportedFiles, setExportedFiles] = useState<{ url: string; name: string }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [dragT0, setDragT0] = useState(0);

  useEffect(() => {
    try { (screen.orientation as any).lock("landscape").catch(()=>{}); } catch {}
    return () => { try { screen.orientation?.unlock?.(); } catch {} };
  }, []);

  const [vMin, vMax] = useMemo(() => {
    if (!history.length) return [0, 10];
    const mx = Math.max(10, history[history.length - 1].time + 2);
    return isListening ? [Math.max(0, mx - 30), mx] : [0, mx];
  }, [history, isListening]);

  const [bMin, bMax] = useMemo(() => {
    if (!history.length) return [60, 160];
    const bs = [...history, ...avgHistory].map(p => p.bpm);
    const pad = Math.max(10, (Math.max(...bs)-Math.min(...bs))*0.2);
    return [Math.max(30, Math.floor((Math.min(...bs)-pad)/5)*5), Math.min(300, Math.ceil((Math.max(...bs)+pad)/5)*5)];
  }, [history, avgHistory]);

  const redraw = useCallback(() => {
    if (canvasRef.current) draw(canvasRef.current, { history, avgHistory, vMin, vMax, bMin, bMax, cursor, sel, live: isListening, elapsed: duration, playbackPosition });
  }, [history, avgHistory, vMin, vMax, bMin, bMax, cursor, sel, isListening, duration, playbackPosition]);

  useEffect(() => { const id = requestAnimationFrame(redraw); return () => cancelAnimationFrame(id); }, [redraw]);
  useEffect(() => { const obs = new ResizeObserver(() => requestAnimationFrame(redraw)); if (containerRef.current) obs.observe(containerRef.current); return () => obs.disconnect(); }, [redraw]);

  const xToT = useCallback((cx: number) => {
    const r = canvasRef.current?.getBoundingClientRect(); if (!r) return 0;
    const ML = 50, MR = 12; return vMin + Math.max(0, Math.min(1, (cx - r.left - ML) / (r.width - ML - MR))) * (vMax - vMin);
  }, [vMin, vMax]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (isListening) return; const t = xToT(e.clientX);
    setIsDrag(true); setDragT0(t); setCursor(t); setSel(null); if (isPlayingBack) stopPlayback();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [xToT, isListening, isPlayingBack, stopPlayback]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (isListening) return; const t = xToT(e.clientX); setCursor(t);
    if (isDrag) { const s = Math.min(dragT0, t), en = Math.max(dragT0, t); if (en - s > 0.3) setSel({ start: s, end: en }); }
  }, [xToT, isDrag, dragT0, isListening]);

  const selStats = useMemo(() => {
    if (!sel || !history.length) return null;
    const pts = history.filter(p => p.time >= sel.start && p.time <= sel.end); if (!pts.length) return null;
    const bs = pts.map(p => p.bpm); return { avg: Math.round(bs.reduce((a, b) => a + b, 0) / bs.length), min: Math.min(...bs), max: Math.max(...bs) };
  }, [sel, history]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0b12] font-sans text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* ── Header compact ── */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-black/40 px-3">
        <button onClick={onBack} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 active:scale-95">
          <ArrowLeft className="size-3.5" />
        </button>

        {/* BPM + chrono en écoute */}
        <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden">
          {isListening && <>
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" /> {formatTime(duration)}
            </span>
            <span className="text-sm font-bold text-orange-300">{currentBpm > 0 ? `${currentBpm} BPM` : "…"}</span>
          </>}
          {!isListening && history.length === 0 && <span className="text-[10px] text-white/30">Écouter ou ouvrir un fichier</span>}
        </div>

        {/* Actions à droite */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Rafraîchir analyse */}
          {(history.length > 0 || audioBlob) && !isListening && (
            <button onClick={reanalyze} title="Recalculer" className="grid size-7 place-items-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 active:scale-90">
              <RotateCcw className="size-3.5" />
            </button>
          )}
          {/* Nouveau */}
          {!isListening && history.length > 0 && (
            <button onClick={() => { reset(); setSel(null); setCursor(null); setExportedFiles([]); setAvgHistory([]); lastAvgTimeRef.current = 0; }} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/60">✕</button>
          )}
          {/* Écouter / Arrêt */}
          <button onClick={isListening ? stop : start} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold active:scale-95 ${isListening ? "bg-white/10 text-white" : "bg-orange-500 text-black"}`}>
            {isListening ? <><Square className="size-3 fill-current" /> Arrêt</> : <><Mic className="size-3" /> Écouter</>}
          </button>
          {/* Ouvrir fichier */}
          <label className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 cursor-pointer">
            <FolderOpen className="size-3.5" />
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setAvgHistory([]); lastAvgTimeRef.current = 0; analyzeFile(file); }}} />
          </label>
        </div>
      </header>

      {error && <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertCircle className="size-3.5 shrink-0" /> {error}</div>}

      {/* ── Barre de sélection ── */}
      {!isListening && sel && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-orange-200">{formatTime(sel.start)} → {formatTime(sel.end)}</span>
            {selStats && <span className="text-[10px] text-white/50">moy <span className="font-bold text-white">{selStats.avg}</span> · {selStats.min}–{selStats.max} BPM</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {audioBlob && <>
              <button onClick={() => isPlayingBack ? stopPlayback() : playSelection(sel.start, sel.end)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold ${isPlayingBack ? "bg-white/10 text-white" : "bg-orange-500 text-black"}`}>{isPlayingBack ? <><Square className="size-2.5 fill-current" /> Stop</> : <><Play className="size-2.5 fill-current" /> Écouter</>}</button>
              <button disabled={isExporting} onClick={async () => { setIsExporting(true); try { const blob = await downloadWav(sel.start, sel.end); if (blob) setExportedFiles(p => [...p, { url: URL.createObjectURL(blob), name: "extrait.wav" }]); } catch {} setIsExporting(false); }} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
                <Download className="size-2.5" /> .wav
              </button>
            </>}
            <button onClick={() => { setSel(null); if(isPlayingBack) stopPlayback(); }} className="text-white/40 hover:text-white px-1"><X className="size-3.5" /></button>
          </div>
        </div>
      )}

      {/* ── Graphique ── */}
      <div ref={containerRef} className="relative min-h-0 flex-1 p-2">
        {history.length < 2 && !isListening && !error && (
          <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-3">
            <Mic className="size-10 text-orange-500/30" />
            <p className="text-sm text-white/40">Écouter ou ouvrir un fichier audio</p>
          </div>
        )}
        {isListening && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-2">
            <div className="flex h-8 items-end gap-1">
              {[0,1,2,3,4,5].map(i => <span key={i} className="rounded-full bg-orange-400/80 transition-all duration-75" style={{ width: 7, height: `${10 + inputLevel * (14 + i * 3)}px` }} />)}
            </div>
            <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] text-white/60 backdrop-blur">Micro actif</div>
          </div>
        )}
        <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair rounded-xl border border-white/[0.06] bg-[#0d0d14]"
          onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={() => setIsDrag(false)}
          onPointerLeave={() => { if (!isDrag) setCursor(null); }}
          style={{ touchAction: "none" }} />
      </div>

      {/* ── Footer : contrôles + légende ── */}
      <div className="flex h-9 shrink-0 items-center justify-between border-t border-white/5 bg-black/20 px-4">
        {/* Points/seconde */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-white/30">pts/s</span>
          <button onClick={() => setPointsPerSec(p => Math.max(0.2, +(p - 0.2).toFixed(1)))} className="grid size-5 place-items-center rounded border border-white/10 bg-white/5 text-[10px] text-white/50">−</button>
          <span className="text-[9px] font-bold text-white/40 w-6 text-center">{pointsPerSec}</span>
          <button onClick={() => setPointsPerSec(p => Math.min(10, +(p + 0.5).toFixed(1)))} className="grid size-5 place-items-center rounded border border-white/10 bg-white/5 text-[10px] text-white/50">+</button>
        </div>

        {/* Légende */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[9px] text-orange-400/70"><span className="h-0.5 w-4 bg-orange-500 rounded-full" /> BPM</span>
          <span className="flex items-center gap-1 text-[9px] text-red-400/70"><span className="h-0.5 w-4 bg-red-500 rounded-full" /> Moy. {avgWindow}s</span>
        </div>

        {/* Fenêtre de moyenne */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-red-400/50">moy</span>
          <button onClick={() => setAvgWindow(w => Math.max(2, w - 2))} className="grid size-5 place-items-center rounded border border-white/10 bg-white/5 text-[10px] text-red-400/50">−</button>
          <span className="text-[9px] font-bold text-red-400/60 w-6 text-center">{avgWindow}s</span>
          <button onClick={() => setAvgWindow(w => Math.min(60, w + 2))} className="grid size-5 place-items-center rounded border border-white/10 bg-white/5 text-[10px] text-red-400/50">+</button>
        </div>
      </div>

      {/* Fichiers exportés */}
      {exportedFiles.length > 0 && (
        <div className="shrink-0 border-t border-green-500/20 bg-green-950/40 px-4 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-green-400">✓ Clic droit → Enregistrer sous</span>
            <button onClick={() => { exportedFiles.forEach(f => URL.revokeObjectURL(f.url)); setExportedFiles([]); }} className="text-[10px] text-white/30">✕</button>
          </div>
          {exportedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-3 mt-1">
              <span className="text-[10px] font-semibold text-green-300 w-28">{file.name}</span>
              <audio controls src={file.url} className="h-7 flex-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
