import { useEffect, useState, type ReactNode } from "react";

/** Petites icônes de barre de statut façon Android (SVG pur, zéro dépendance) */
function StatusIcons() {
  return (
    <div className="flex items-center gap-1.5 text-white/70">
      {/* Réseau */}
      <svg width="15" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
        <rect x="0" y="7" width="3" height="5" rx="1" opacity="0.4" />
        <rect x="4" y="5" width="3" height="7" rx="1" opacity="0.6" />
        <rect x="8" y="2.5" width="3" height="9.5" rx="1" opacity="0.85" />
        <rect x="12" y="0" width="3" height="12" rx="1" />
      </svg>
      {/* Wifi */}
      <svg width="15" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
        <path d="M8 10.6 5.5 8.1a3.55 3.55 0 0 1 5 0L8 10.6Z" />
        <path d="M3.3 5.9a6.7 6.7 0 0 1 9.4 0l-1.6 1.6a4.35 4.35 0 0 0-6.2 0L3.3 5.9Z" opacity="0.75" />
        <path d="M0.9 3.4a10.2 10.2 0 0 1 14.2 0l-1.6 1.6a7.85 7.85 0 0 0-11 0L0.9 3.4Z" opacity="0.5" />
      </svg>
      {/* Batterie */}
      <svg width="22" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
        <rect x="0.6" y="0.6" width="20" height="10.8" rx="3" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
        <rect x="2.6" y="2.6" width="13" height="6.8" rx="1.6" fill="currentColor" />
        <path d="M23 4v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" fillOpacity="0.5" />
      </svg>
    </div>
  );
}

/** Barre de statut façon Android avec l'heure réelle du PC */
export function StatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-6 text-[13px] font-medium text-white/80">
      <span className="tracking-wide">{time}</span>
      <StatusIcons />
    </div>
  );
}

/**
 * Cadre « téléphone Android » : plein écran sur mobile,
 * émulation d'appareil centrée sur écran de PC (md et +).
 */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full h-dvh md:h-[min(94dvh,920px)] md:w-auto md:aspect-[9/19.5] md:rounded-[52px] md:border md:border-white/10 md:bg-gradient-to-b md:from-[#1b1b21] md:to-[#0b0b0f] md:p-[12px] md:shadow-[0_80px_140px_-40px_rgba(0,0,0,0.95),0_0_0_1px_rgba(0,0,0,0.8),0_0_160px_-60px_rgba(255,130,20,0.15)]">
      {/* Boutons latéraux */}
      <div className="absolute -right-[3px] top-[190px] hidden h-24 w-[4px] rounded-full bg-[#2b2b33] md:block" />
      <div className="absolute -left-[3px] top-[160px] hidden h-14 w-[4px] rounded-full bg-[#2b2b33] md:block" />
      <div className="absolute -left-[3px] top-[226px] hidden h-14 w-[4px] rounded-full bg-[#2b2b33] md:block" />

      {/* Écran */}
      <div className="relative h-full w-full overflow-hidden bg-[#08080a] md:rounded-[40px]">
        {children}

        {/* Caméra perforée */}
        <div className="pointer-events-none absolute left-1/2 top-[15px] z-40 hidden size-[13px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10 md:block">
          <div className="absolute left-[2.5px] top-[2.5px] size-[4px] rounded-full bg-[#1d2b3a]" />
        </div>
      </div>
    </div>
  );
}
