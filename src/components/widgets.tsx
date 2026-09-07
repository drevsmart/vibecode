import { useEffect, useRef, useState, ReactNode, CSSProperties } from "react";
import { Finding, Severity } from "../utils/nginxAnalyzer";

/* ---------------------------------------------------------------- */
/*  Scroll reveal                                                    */
/* ---------------------------------------------------------------- */

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? "is-shown" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Анимированное число                                              */
/* ---------------------------------------------------------------- */

export function AnimatedNumber({ value, className = "" }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
}

/* ---------------------------------------------------------------- */
/*  Кольцо оценки                                                    */
/* ---------------------------------------------------------------- */

export function ScoreRing({ score, size = 108, label, tone }: { score: number; size?: number; label: string; tone: "bad" | "good" }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const id = setTimeout(() => setOffset(c - (c * score) / 100), 80);
    return () => clearTimeout(id);
  }, [score, c]);
  const color = tone === "good" ? "#34d399" : score >= 70 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c2634" strokeWidth="8" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1), stroke 0.4s", filter: `drop-shadow(0 0 6px ${color}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={score} className="text-3xl font-bold font-mono" />
          <span className="text-[10px] uppercase tracking-widest text-fog-500">/ 100</span>
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-widest text-fog-300">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Терминал с эффектом печати                                       */
/* ---------------------------------------------------------------- */

export interface TermLine {
  text: string;
  tone: "cmd" | "out" | "good" | "warn" | "bad";
}

export function Terminal({ lines, runId }: { lines: TermLine[]; runId: number }) {
  const full = useMemoText(lines);
  const [n, setN] = useState(0);
  const done = n >= full.length;

  useEffect(() => {
    setN(0);
    const iv = setInterval(() => {
      setN((v) => {
        if (v >= full.length) {
          clearInterval(iv);
          return v;
        }
        return v + 3;
      });
    }, 16);
    return () => clearInterval(iv);
  }, [full, runId]);

  const visible = full.slice(0, n);
  const toneCls: Record<TermLine["tone"], string> = {
    cmd: "text-fog-100",
    out: "text-fog-300",
    good: "text-pulse-400",
    warn: "text-ember-400",
    bad: "text-flare-400",
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-700/70 bg-[#0a0e14] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      {/* scanline */}
      <div className="pointer-events-none absolute inset-x-0 h-16 opacity-[0.05]" style={{ background: "linear-gradient(180deg, transparent, #34d399, transparent)", animation: "scan 5s linear infinite" }} />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-700/60 bg-ink-900/80">
        <span className="w-3 h-3 rounded-full bg-[#f87171]/80" />
        <span className="w-3 h-3 rounded-full bg-[#fbbf24]/80" />
        <span className="w-3 h-3 rounded-full bg-[#34d399]/80" />
        <span className="ml-2 text-xs font-mono text-fog-500">root@monitoring:~</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-fog-500">
          <span className="w-1.5 h-1.5 rounded-full bg-pulse-400 live-dot" /> live
        </span>
      </div>
      <div className="p-4 min-h-[228px] font-mono text-[12.5px] leading-6">
        {lines.map((line, i) => {
          const startIdx = lineStarts(lines, i);
          const shown = visible.slice(startIdx, Math.min(visible.length, startIdx + line.text.length));
          if (shown.length === 0 && !done) return null;
          return (
            <div key={i} className={toneCls[line.tone]}>
              {line.tone === "cmd" && <span className="text-pulse-400 select-none">$ </span>}
              {shown}
              {!done && visible.length > startIdx && visible.length < startIdx + line.text.length && (
                <span className="caret" />
              )}
            </div>
          );
        })}
        {done && <div className="text-fog-500 caret select-none">$&nbsp;</div>}
      </div>
    </div>
  );
}

function useMemoText(lines: TermLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

function lineStarts(lines: TermLine[], i: number): number {
  let s = 0;
  for (let k = 0; k < i; k++) s += lines[k].text.length + 1;
  return s;
}

/* ---------------------------------------------------------------- */
/*  Карточка находки                                                 */
/* ---------------------------------------------------------------- */

const SEV_META: Record<Severity, { label: string; chip: string; bar: string; dot: string }> = {
  critical: {
    label: "Критично",
    chip: "bg-flare-500/15 text-flare-400 border-flare-500/40",
    bar: "border-l-flare-500",
    dot: "bg-flare-400",
  },
  warning: {
    label: "Предупреждение",
    chip: "bg-ember-500/15 text-ember-400 border-ember-500/40",
    bar: "border-l-ember-500",
    dot: "bg-ember-400",
  },
  info: {
    label: "Заметка",
    chip: "bg-wave-400/15 text-wave-400 border-wave-400/40",
    bar: "border-l-wave-400",
    dot: "bg-wave-400",
  },
  ok: {
    label: "Проверено",
    chip: "bg-pulse-500/15 text-pulse-400 border-pulse-500/40",
    bar: "border-l-pulse-500",
    dot: "bg-pulse-400",
  },
};

export function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(finding.severity === "critical");
  const [copied, setCopied] = useState(false);
  const meta = SEV_META[finding.severity];

  const copy = async () => {
    if (!finding.fix) return;
    try {
      await navigator.clipboard.writeText(finding.fix);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard может быть недоступен в iframe */
    }
  };

  return (
    <div
      className={`anim-rise group rounded-lg border border-ink-700/60 border-l-4 ${meta.bar} bg-ink-850/80 hover:bg-ink-800/80 hover:border-ink-600/70 hover:-translate-y-0.5 transition-all duration-200 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot} ${finding.severity === "critical" ? "live-dot" : ""}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${meta.chip}`}>
              {meta.label}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-fog-500">{finding.category}</span>
          </div>
          <h4 className="mt-1 font-semibold text-[15px] text-fog-100 leading-snug">{finding.title}</h4>
        </div>
        <svg
          className={`w-4 h-4 shrink-0 text-fog-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-3">
            <p className="text-sm text-fog-300 leading-relaxed">{finding.detail}</p>

            {finding.evidence && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-fog-500 mb-1.5">В конфиге</div>
                <pre className="text-[12px] font-mono px-3 py-2 rounded-md bg-[#0a0e14] border border-ink-700/60 text-flare-400/90 overflow-x-auto whitespace-pre">
                  {finding.evidence}
                </pre>
              </div>
            )}

            {finding.fix && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-pulse-400">Как исправить</span>
                  <button
                    onClick={copy}
                    className="text-[11px] font-mono px-2 py-0.5 rounded border border-ink-600 text-fog-300 hover:border-pulse-500 hover:text-pulse-300 transition-colors"
                  >
                    {copied ? "✓ скопировано" : "копировать"}
                  </button>
                </div>
                <pre className="text-[12px] font-mono px-3 py-2 rounded-md bg-pulse-500/[0.06] border border-pulse-500/25 text-pulse-300/90 overflow-x-auto whitespace-pre">
                  {finding.fix}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
