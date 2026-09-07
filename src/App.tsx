import { useMemo, useState } from "react";
import {
  ORIGINAL_CONFIG,
  FIXED_CONFIG,
  CHANGES,
  auditConfig,
  scoreOf,
  countBy,
  addedLines,
  changedLines,
  Severity,
} from "./utils/nginxAnalyzer";
import CodePanel from "./components/CodePanel";
import { Terminal, TermLine, ScoreRing, FindingCard, Reveal, AnimatedNumber } from "./components/widgets";

type Tab = "orig" | "fixed" | "log";
type Filter = "all" | Severity;

export default function App() {
  const [config, setConfig] = useState(ORIGINAL_CONFIG);
  const [tab, setTab] = useState<Tab>("orig");
  const [filter, setFilter] = useState<Filter>("all");
  const [runId, setRunId] = useState(0);
  const [copied, setCopied] = useState(false);

  const origFindings = useMemo(() => auditConfig(config), [config]);
  const fixedFindings = useMemo(() => auditConfig(FIXED_CONFIG), []);

  const activeFindings = tab === "orig" ? origFindings : fixedFindings;
  const activeCounts = countBy(activeFindings);
  const origScore = scoreOf(origFindings);
  const fixedScore = scoreOf(fixedFindings);

  const origMarks = useMemo(() => changedLines(config, FIXED_CONFIG), [config]);
  const fixedMarks = useMemo(() => addedLines(config, FIXED_CONFIG), [config]);

  const switchTab = (t: Tab) => {
    if (t !== tab) {
      setTab(t);
      setRunId((v) => v + 1);
    }
  };

  const copyFixed = async () => {
    try {
      await navigator.clipboard.writeText(FIXED_CONFIG);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard недоступен */
    }
  };

  const termLines: TermLine[] = useMemo(() => {
    const c = activeCounts;
    const summary =
      activeFindings === origFindings
        ? [
            { text: `✖ ${c.critical} критичных · ⚠ ${c.warning} предупреждений · ⓘ ${c.info} заметки`, tone: c.critical > 0 ? "bad" : "warn" },
            ...(c.critical > 0
              ? activeFindings
                  .filter((f) => f.severity === "critical")
                  .slice(0, 4)
                  .map((f) => ({ text: `  ↳ ${f.title.toLowerCase()}`, tone: "bad" as const }))
              : []),
          ]
        : [
            { text: `✔ 0 критичных · 0 предупреждений · ⓘ ${c.info} заметка — read-only защита полная`, tone: "good" },
            { text: "  ↳ TLS 1.2/1.3, редирект 301, rate-limit 20 r/s, websocket", tone: "good" },
          ];
    return [
      { text: "nginx -t", tone: "cmd" },
      { text: "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok", tone: "out" },
      { text: "nginx: configuration file /etc/nginx/nginx.conf test is successful", tone: "out" },
      { text: "grafana-audit /etc/nginx/conf.d/grafana.conf", tone: "cmd" },
      ...(summary as TermLine[]),
    ];
  }, [activeCounts, activeFindings, origFindings]);

  const visibleFindings = useMemo(() => {
    if (filter === "all") return activeFindings.filter((f) => f.severity !== "ok");
    if (filter === "ok") return activeFindings.filter((f) => f.severity === "ok");
    return activeFindings.filter((f) => f.severity === filter);
  }, [activeFindings, filter]);

  const chipMeta: { key: Filter; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Проблемы", count: activeCounts.critical + activeCounts.warning + activeCounts.info, cls: "data-[on=true]:bg-ink-600/60 data-[on=true]:text-fog-100" },
    { key: "critical", label: "Критичные", count: activeCounts.critical, cls: "data-[on=true]:bg-flare-500/20 data-[on=true]:text-flare-400 data-[on=true]:border-flare-500/50" },
    { key: "warning", label: "Предупреждения", count: activeCounts.warning, cls: "data-[on=true]:bg-ember-500/20 data-[on=true]:text-ember-400 data-[on=true]:border-ember-500/50" },
    { key: "info", label: "Заметки", count: activeCounts.info, cls: "data-[on=true]:bg-wave-400/20 data-[on=true]:text-wave-400 data-[on=true]:border-wave-400/50" },
    { key: "ok", label: "Проверено", count: activeCounts.ok, cls: "data-[on=true]:bg-pulse-500/20 data-[on=true]:text-pulse-400 data-[on=true]:border-pulse-500/50" },
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-fog-100 relative">
      {/* ambient background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-blueprint" />
        <div className="absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full opacity-[0.13]" style={{ background: "radial-gradient(circle, #10b981 0%, transparent 65%)" }} />
        <div className="absolute -bottom-52 -right-32 w-[620px] h-[620px] rounded-full opacity-[0.09]" style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 65%)" }} />
      </div>

      {/* header */}
      <header className="sticky top-0 z-50 border-b border-ink-700/60 bg-ink-950/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-ink-800 border border-pulse-500/40 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 32 32" className="w-5 h-5">
                <path d="M9 23V9l14 14V9" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-[17px] leading-tight tracking-tight">
                nginx <span className="text-pulse-400">audit</span>
              </h1>
              <p className="text-[11px] font-mono text-fog-500 truncate">conf.d/grafana.conf · read-only режим</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 font-mono text-sm px-3 py-1.5 rounded-lg bg-ink-850 border border-ink-700">
              <span className="text-flare-400 font-bold">
                <AnimatedNumber value={origScore} />
              </span>
              <svg className="w-4 h-4 text-fog-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 7l5 5-5 5" />
              </svg>
              <span className="text-pulse-400 font-bold">
                <AnimatedNumber value={fixedScore} />
              </span>
            </div>
            <button
              onClick={copyFixed}
              className="px-3.5 py-2 rounded-lg bg-pulse-600 hover:bg-pulse-500 text-white text-sm font-semibold transition-colors shadow-[0_0_24px_-6px_rgba(16,185,129,0.6)]"
            >
              {copied ? "✓ Скопировано" : "Скачать исправленный"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-5 pb-20">
        {/* ================= top: terminal + scores ================= */}
        <section className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 pt-8">
          <Reveal>
            <Terminal lines={termLines} runId={runId + (tab === "orig" ? 0 : 1000)} />
            <p className="mt-3 text-[13px] text-fog-500 leading-relaxed">
              <span className="text-fog-300 font-semibold">Синтаксис nginx валиден</span> — <code className="font-mono text-pulse-400/90">nginx -t</code> проходит.
              Все находки — <em>логические</em>: дыры в покрытии API и отсутствие защиты транспорта.
              Переключайтесь между версиями конфига ниже — аудит пересчитывается на лету.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="h-full rounded-xl border border-ink-700/70 bg-ink-900/70 p-5 flex flex-col">
              <div className="flex items-center justify-around flex-1">
                <ScoreRing score={origScore} label="Было" tone="bad" />
                <div className="flex flex-col items-center gap-1 -mt-6">
                  <svg className="w-6 h-6 text-fog-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5" />
                  </svg>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-pulse-500/15 text-pulse-300 border border-pulse-500/30">
                    +<AnimatedNumber value={fixedScore - origScore} />
                  </span>
                </div>
                <ScoreRing score={fixedScore} label="Стало" tone="good" />
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                <CountCell n={activeCounts.critical} label="крит." tone="text-flare-400" />
                <CountCell n={activeCounts.warning} label="пред." tone="text-ember-400" />
                <CountCell n={activeCounts.info} label="заметки" tone="text-wave-400" />
                <CountCell n={activeCounts.ok} label="ок" tone="text-pulse-400" />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================= findings ================= */}
        <section className="pt-14">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-pulse-400 mb-1">01 · аудит</div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {tab === "orig" ? "Найденные проблемы" : "Повторный прогон после правок"}
                </h2>
                <p className="text-sm text-fog-500 mt-1">
                  {tab === "orig"
                    ? "Исходный конфиг: 4 способа обойти read-only режим и отсутствие TLS."
                    : "Исправленный конфиг проходит те же проверки."}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chipMeta.map((c) => (
                  <button
                    key={c.key}
                    data-on={filter === c.key}
                    onClick={() => setFilter(c.key)}
                    className={`px-3 py-1.5 rounded-full border border-ink-700 text-xs font-semibold text-fog-300 transition-all duration-200 hover:border-ink-600 ${c.cls}`}
                  >
                    {c.label} <span className="font-mono opacity-70">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="space-y-3">
            {visibleFindings.map((f, i) => (
              <FindingCard key={`${tab}-${f.id}`} finding={f} index={i} />
            ))}
            {visibleFindings.length === 0 && (
              <div className="anim-rise rounded-lg border border-pulse-500/30 bg-pulse-500/[0.06] px-5 py-6 text-center">
                <div className="text-2xl mb-1 text-pulse-400">✓</div>
                <p className="text-pulse-300 font-semibold">По этому фильтру находок нет</p>
              </div>
            )}
          </div>
        </section>

        {/* ================= code ================= */}
        <section className="pt-14">
          <Reveal>
            <div className="mb-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-pulse-400 mb-1">02 · конфигурация</div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Было → Стало</h2>
            </div>

            <div className="rounded-xl border border-ink-700/70 overflow-hidden bg-[#0a0e14] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
              {/* tabs */}
              <div className="relative grid grid-cols-3 border-b border-ink-700/60 bg-ink-900/80">
                {(
                  [
                    ["orig", "Исходный"],
                    ["fixed", "Исправленный"],
                    ["log", "Журнал изменений"],
                  ] as [Tab, string][]
                ).map(([t, label], i) => (
                  <button
                    key={t}
                    onClick={() => switchTab(t)}
                    className={`relative py-3 text-sm font-semibold transition-colors ${
                      tab === t ? "text-fog-100" : "text-fog-500 hover:text-fog-300"
                    }`}
                  >
                    {label}
                    {tab === t && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-1/2 bg-pulse-400 rounded-full"
                        style={{ animation: "rise 0.25s ease-out" }}
                      />
                    )}
                    <span className="sr-only">{i}</span>
                  </button>
                ))}
              </div>

              {/* toolbar */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-ink-700/60 bg-ink-900/40">
                <span className="font-mono text-xs text-fog-500">
                  {tab === "fixed" ? "/etc/nginx/conf.d/grafana.conf.fixed" : "/etc/nginx/conf.d/grafana.conf"}
                </span>
                {tab === "orig" && (
                  <span className="flex items-center gap-1.5 text-[11px] font-mono text-flare-400/80">
                    <span className="inline-block w-3 h-3 border-l-2 border-flare-400 bg-flare-500/10" /> строки, изменённые в новой версии
                  </span>
                )}
                {tab === "fixed" && (
                  <span className="flex items-center gap-1.5 text-[11px] font-mono text-pulse-300/80">
                    <span className="inline-block w-3 h-3 border-l-2 border-pulse-400 bg-pulse-500/10" /> добавлено / изменено
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {tab === "orig" && (
                    <span className="text-[11px] text-fog-500">можно редактировать — аудит пересчитается</span>
                  )}
                  <button
                    onClick={copyFixed}
                    className="text-[11px] font-mono px-2.5 py-1 rounded border border-ink-600 text-fog-300 hover:border-pulse-500 hover:text-pulse-300 transition-colors"
                  >
                    {copied ? "✓ скопировано" : "копировать всё"}
                  </button>
                </div>
              </div>

              {tab === "orig" && <CodePanel code={config} onChange={setConfig} markedLines={origMarks} markTone="del" />}
              {tab === "fixed" && <CodePanel code={FIXED_CONFIG} markedLines={fixedMarks} markTone="add" />}

              {tab === "log" && (
                <div className="p-4 grid md:grid-cols-2 gap-3 bg-[#0a0e14]">
                  {CHANGES.map((c, i) => (
                    <div
                      key={i}
                      className="anim-rise rounded-lg border border-ink-700/60 bg-ink-850/70 p-4 hover:border-pulse-500/40 hover:-translate-y-0.5 transition-all duration-200"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center font-mono text-sm font-bold ${
                            c.kind === "added"
                              ? "bg-pulse-500/15 text-pulse-400 border border-pulse-500/40"
                              : "bg-wave-400/15 text-wave-400 border border-wave-400/40"
                          }`}
                        >
                          {c.kind === "added" ? "+" : "~"}
                        </span>
                        <h4 className="font-semibold text-sm">{c.title}</h4>
                      </div>
                      <p className="text-[13px] text-fog-300 leading-relaxed">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </section>

        {/* ================= deploy ================= */}
        <section className="pt-14">
          <Reveal>
            <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-pulse-400 mb-1">03 · применение</div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">На сервере</h2>
            <div className="grid md:grid-cols-[1fr_1fr] gap-4">
              <div className="rounded-xl border border-ink-700/70 bg-[#0a0e14] p-4 font-mono text-[12.5px] leading-7">
                <div className="text-fog-500"># положить исправленный конфиг и проверить</div>
                <div><span className="text-pulse-400">$</span> <span className="text-fog-100">sudo cp grafana.conf.fixed /etc/nginx/conf.d/grafana.conf</span></div>
                <div><span className="text-pulse-400">$</span> <span className="text-fog-100">sudo nginx -t</span></div>
                <div><span className="text-pulse-400">$</span> <span className="text-fog-100">sudo systemctl reload nginx</span></div>
                <div className="mt-2 text-fog-500"># если сертификата ещё нет</div>
                <div><span className="text-pulse-400">$</span> <span className="text-fog-100">sudo certbot --nginx -d grafana.example.com</span></div>
              </div>
              <div className="rounded-xl border border-ink-700/70 bg-ink-900/70 p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-ember-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.2 16a2 2 0 001.73 3z" />
                  </svg>
                  Что проверить вручную
                </h3>
                <ul className="space-y-2 text-[13px] text-fog-300 leading-relaxed">
                  <li className="flex gap-2"><span className="text-ember-400 font-mono">1.</span> Файл <code className="font-mono text-wave-400">/etc/nginx/proxy_params_grafana.conf</code> существует — иначе nginx не стартует.</li>
                  <li className="flex gap-2"><span className="text-ember-400 font-mono">2.</span> На хосте есть IPv6 — иначе удалите строки <code className="font-mono text-wave-400">listen [::]</code>.</li>
                  <li className="flex gap-2"><span className="text-ember-400 font-mono">3.</span> Быстрый смоук-тест: <code className="font-mono text-wave-400">curl -X POST -u admin:… http://localhost/api/dashboards/db</code> должен вернуть <span className="font-mono text-flare-400">403</span>, а GET дашборда — <span className="font-mono text-pulse-400">200</span>.</li>
                  <li className="flex gap-2"><span className="text-ember-400 font-mono">4.</span> Статический анализ не заменяет <code className="font-mono text-wave-400">nginx -t</code>: пути к сертификатам проверяются только на реальной машине.</li>
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        <footer className="pt-14 pb-4 text-center text-xs font-mono text-fog-500">
          grafana-audit · статический анализатор nginx-конфигов · покрытие read-only для Grafana 8/9/10+
        </footer>
      </main>
    </div>
  );
}

function CountCell({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg bg-ink-850/80 border border-ink-700/60 py-2">
      <div className={`font-mono text-lg font-bold leading-none ${tone}`}>
        <AnimatedNumber value={n} />
      </div>
      <div className="text-[10px] uppercase tracking-widest text-fog-500 mt-1">{label}</div>
    </div>
  );
}
