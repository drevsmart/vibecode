import { useRef, useEffect } from 'react';

interface ConfigEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ConfigEditor({ value, onChange }: ConfigEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lines = value.split('\n');

  useEffect(() => {
    const textarea = textareaRef.current;
    const lineNumbers = lineNumbersRef.current;
    if (textarea && lineNumbers) {
      const handleScroll = () => {
        lineNumbers.scrollTop = textarea.scrollTop;
      };
      textarea.addEventListener('scroll', handleScroll);
      return () => textarea.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const highlightLine = (line: string): string => {
    // Comments
    if (line.trim().startsWith('#')) {
      return `<span class="text-gray-500 italic">${escapeHtml(line)}</span>`;
    }

    let result = escapeHtml(line);

    // Directives
    result = result.replace(
      /\b(upstream|server|location|listen|server_name|proxy_pass|include|limit_except|deny|add_header|return|limit_req|limit_conn)\b/g,
      '<span class="text-purple-400 font-semibold">$1</span>'
    );

    // HTTP methods
    result = result.replace(
      /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g,
      '<span class="text-yellow-400">$1</span>'
    );

    // Strings/URLs
    result = result.replace(
      /(https?:\/\/[^\s;{}]+)/g,
      '<span class="text-green-400">$1</span>'
    );

    // Regex patterns in location
    result = result.replace(
      /(\^\/[^\s{}]+)/g,
      '<span class="text-cyan-400">$1</span>'
    );

    // Braces
    result = result.replace(
      /([{}])/g,
      '<span class="text-orange-400">$1</span>'
    );

    // Numbers (ports)
    result = result.replace(
      /\b(\d{2,5})\b/g,
      '<span class="text-blue-400">$1</span>'
    );

    // all keyword
    result = result.replace(
      /\b(all)\b/g,
      '<span class="text-red-400">$1</span>'
    );

    return result;
  };

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  return (
    <div className="relative flex h-[calc(100vh-280px)] min-h-[400px]">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="overflow-hidden bg-gray-900/50 border-r border-gray-800 select-none text-right py-3 px-2"
        style={{ minWidth: '3rem' }}
      >
        {lines.map((_, idx) => (
          <div key={idx} className="text-xs text-gray-600 leading-5 font-mono">
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Code area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Highlighted code (background) */}
        <pre
          className="absolute inset-0 py-3 px-4 text-xs leading-5 font-mono overflow-hidden pointer-events-none whitespace-pre"
          aria-hidden="true"
        >
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="leading-5"
              dangerouslySetInnerHTML={{ __html: highlightLine(line) || '&nbsp;' }}
            />
          ))}
        </pre>

        {/* Editable textarea (foreground, transparent text) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full py-3 px-4 text-xs leading-5 font-mono bg-transparent text-transparent caret-white resize-none outline-none"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}
