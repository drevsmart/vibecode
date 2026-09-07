import { ConfigTest } from '../utils/nginxAnalyzer';

interface TestResultsProps {
  tests: ConfigTest[];
  hasRun: boolean;
}

export default function TestResults({ tests, hasRun }: TestResultsProps) {
  if (!hasRun) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-280px)] min-h-[400px] text-gray-500">
        <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">Нажмите «Запустить тесты» для анализа</p>
        <p className="text-xs mt-1 text-gray-600">конфигурации nginx</p>
      </div>
    );
  }

  // Group tests by category
  const categories = [...new Set(tests.map(t => t.category))];

  return (
    <div className="overflow-y-auto h-[calc(100vh-280px)] min-h-[400px] p-3 space-y-4">
      {categories.map(category => {
        const categoryTests = tests.filter(t => t.category === category);
        const allPassed = categoryTests.every(t => t.status === 'pass');

        return (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <span className={`w-2 h-2 rounded-full ${allPassed ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{category}</h3>
              <span className="text-xs text-gray-600 ml-auto">
                {categoryTests.filter(t => t.status === 'pass').length}/{categoryTests.length}
              </span>
            </div>

            <div className="space-y-1">
              {categoryTests.map((test, idx) => (
                <TestItem key={idx} test={test} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestItem({ test }: { test: ConfigTest }) {
  const statusConfig = {
    pass: {
      icon: '✓',
      bg: 'bg-green-950/30',
      border: 'border-green-900/30',
      text: 'text-green-400',
      iconBg: 'bg-green-500/20',
    },
    fail: {
      icon: '✗',
      bg: 'bg-red-950/30',
      border: 'border-red-900/30',
      text: 'text-red-400',
      iconBg: 'bg-red-500/20',
    },
    warn: {
      icon: '⚠',
      bg: 'bg-yellow-950/30',
      border: 'border-yellow-900/30',
      text: 'text-yellow-400',
      iconBg: 'bg-yellow-500/20',
    },
  };

  const config = statusConfig[test.status];

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${config.bg} ${config.border}`}>
      <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${config.iconBg} ${config.text}`}>
        {config.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-200 truncate">{test.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{test.message}</p>
      </div>
    </div>
  );
}
