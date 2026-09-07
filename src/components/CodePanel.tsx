import { useRef, useEffect, useMemo } from "react";

interface CodePanelProps {
  code: string;
  onChange?: (v: string) => void;
  markedLines?: Set<number>;
  markTone?: "add" | "del";
  heightClass?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function highlight(line: string): string {
  if (line.trim().startsWith("#")) {
    return `<span class="italic" style="color:#5d6b80">${escapeHtml(line)}</span>`;
  }
  let r = escapeHtml(line);
  r = r.replace(
    /\b(upstream|server|location|listen|server_name|proxy_pass|proxy_http_version|proxy_set_header|proxy_read_timeout|proxy_send_timeout|include|limit_except|limit_req_zone|limit_req|deny|add_header|return|keepalive|ssl_certificate|ssl_certificate_key|ssl_protocols|http2)\b/g,
    '<span style="color:#4ade80">$1</span>',
  );
  r = r.replace(
    /\b(GET|HEAD|POST|PUT|DELETE|PATCH)\b/g,
    '<span style="color:#fbbf24">$1</span>',
  );
  r = r.replace(
    /(https?:\/\/[^\s;{}]*)/g,
    '<span style="color:#7dd3fc">$1</span>',
  );
  r = r.replace(
    /(\$binary_remote_addr|\$host|\$request_uri|\$http_upgrade)/g,
    '<span style="color:#c4b5fd">$1</span>',
  );
  r = r.replace(/(\^\/[^\s{}|)]+)/g, '<span style="color:#67e8f9">$1</span>');
  r = r.replace(/\b(\d+[sm]?)(?=[;\s])|(\d{2,5})\b/g, (m) => `<span style="color:#93c5fd">${m}</span>`);
  r = r.replace(/([{}])/g, '<span style="color:#e8b04b">$1</span>');
  r = r.replace(/\b(all|always|nodelay|burst|zone|rate|upgrade)\b/g, '<span style="color:#f0abfc">$1</span>');
  return r;
}

export default function CodePanel({ code, onChange, markedLines, markTone = "add", heightClass = "h-[560px]" }: CodePanelProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => code.split("\n"), [code]);
  const readOnly = !onChange;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta || readOnly) return;
    const sync = () => {
      if (preRef.current) {
        preRef.current.scrollTop = ta.scrollTop;
        preRef.current.scrollLeft = ta.scrollLeft;
      }
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    };
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, [readOnly]);

  useEffect(() => {
    const wrap = preRef.current;
    if (!wrap || !readOnly) return;
    const sync = () => {
      if (gutterRef.current) gutterRef.current.scrollTop = wrap.scrollTop;
    };
    wrap.addEventListener("scroll", sync);
    return () => wrap.removeEventListener("scroll", sync);
  }, [readOnly]);

  const markCls =
    markTone === "add"
      ? "bg-pulse-500/10 border-l-2 border-pulse-400/80"
      : "bg-flare-500/10 border-l-2 border-flare-400/70";

  return (
    <div className={`relative flex overflow-hidden ${heightClass} bg-[#0a0e14]`}>
      {/* gutter */}
      <div
        ref={gutterRef}
        className="overflow-hidden shrink-0 select-none border-r border-ink-700/60 bg-ink-900/60 py-3 w-14"
      >
        {lines.map((_, i) => {
          const n = i + 1;
          const marked = markedLines?.has(n);
          return (
            <div
              key={i}
              className={`h-5 leading-5 text-right pr-2 font-mono text-[11px] ${
                marked
                  ? markTone === "add"
                    ? "text-pulse-300 font-bold"
                    : "text-flare-400 font-bold"
                  : "text-fog-500/60"
              }`}
            >
              {marked ? (markTone === "add" ? "+" : "~") : n}
            </div>
          );
        })}
      </div>

      {/* code */}
      <div className="relative flex-1 min-w-0">
        {readOnly ? (
          <div ref={preRef} className="absolute inset-0 overflow-auto py-3">
            {lines.map((line, i) => {
              const marked = markedLines?.has(i + 1);
              return (
                <div
                  key={i}
                  className={`h-5 leading-5 px-4 font-mono text-[12px] whitespace-pre ${marked ? markCls : "border-l-2 border-transparent"}`}
                  dangerouslySetInnerHTML={{ __html: highlight(line) || "&nbsp;" }}
                />
              );
            })}
            <div className="h-6" />
          </div>
        ) : (
          <>
            <div ref={preRef} className="absolute inset-0 overflow-hidden py-3 pointer-events-none" aria-hidden>
              {lines.map((line, i) => {
                const marked = markedLines?.has(i + 1);
                return (
                  <div
                    key={i}
                    className={`h-5 leading-5 px-4 font-mono text-[12px] whitespace-pre ${marked ? markCls : "border-l-2 border-transparent"}`}
                    dangerouslySetInnerHTML={{ __html: highlight(line) || "&nbsp;" }}
                  />
                );
              })}
            </div>
            <textarea
              ref={taRef}
              value={code}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className="absolute inset-0 w-full h-full py-3 px-4 font-mono text-[12px] leading-5 bg-transparent text-transparent caret-pulse-300 resize-none outline-none whitespace-pre overflow-auto"
            />
          </>
        )}
      </div>
    </div>
  );
}
