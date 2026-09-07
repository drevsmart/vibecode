import { useState } from 'react';
import ConfigEditor from './components/ConfigEditor';
import TestResults from './components/TestResults';
import { runTests, ConfigTest } from './utils/nginxAnalyzer';

const DEFAULT_CONFIG = `# /etc/nginx/conf.d/grafana.conf

upstream grafana {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name grafana.example.com;

    # Если за HTTPS — раскомментируйте:
    # listen 443 ssl http2;
    # ssl_certificate     /etc/nginx/ssl/grafana.crt;
    # ssl_certificate_key /etc/nginx/ssl/grafana.key;

    # =====================================================
    # БЛОКИРОВКА РЕДАКТИРОВАНИЯ (Read-Only Mode)
    # ВАЖНО: Исключения должны идти ВЫШЕ ограничивающих блоков!
    # =====================================================

    # --- 1. ИСКЛЮЧЕНИЯ (Разрешаем все методы для этих путей) ---

    # Звёздочки (избранное) на дашбордах
    location ~ ^/api/dashboards/uid/[^/]+/stars$ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # КРИТИЧНО: Proxy-запросы к источникам данных (Prometheus, Loki, InfluxDB и др.)
    # Они часто используют POST для передачи тела запроса, блокировать их нельзя!
    location ~ ^/api/datasources/proxy/ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # КРИТИЧНО: Resources-запросы к источникам данных (используются плагинами и некоторыми DS)
    location ~ ^/api/datasources/uid/[^/]+/resources/ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # --- 2. ОГРАНИЧЕНИЯ (Только GET, остальное deny all) ---

    # Дашборды: блокирует создание, сохранение, импорт, удаление
    location ~ ^/api/dashboards/ {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Источники данных (управление): блокирует добавление/изменение/удаление подключений
    # (На proxy и resources это не повлияет, так как они обработаны выше)
    location ~ ^/api/datasources(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Библиотечные панели (Library Panels): блокирует создание и редактирование
    location ~ ^/api/library-elements(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Папки: блокирует создание, переименование, удаление
    location ~ ^/api/folders(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Unified Alerting (Grafana 9+): блокирует правила, contact points, policies
    location ~ ^/api/v1/provisioning/ {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Legacy Alerting (Grafana < 9)
    location ~ ^/api/alert(s|-notifications) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Аннотации: блокирует создание/удаление аннотаций на графиках
    location ~ ^/api/annotations(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Пользователи, команды и организации
    location ~ ^/api/(users|teams|org|orgs)(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Сервисные аккаунты и API-ключи
    location ~ ^/api/(serviceaccounts|auth/keys)(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # =====================================================
    # КОНЕЦ БЛОКИРОВКИ
    # =====================================================

    # Всё остальное — без ограничений (login, /api/ds/query, поиск и т.д.)
    location / {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }
}`;

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tests, setTests] = useState<ConfigTest[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const handleRunTests = () => {
    const results = runTests(config);
    setTests(results);
    setHasRun(true);
  };

  const passedCount = tests.filter(t => t.status === 'pass').length;
  const failedCount = tests.filter(t => t.status === 'fail').length;
  const warnCount = tests.filter(t => t.status === 'warn').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Nginx Config Analyzer</h1>
              <p className="text-xs text-gray-400">Тестирование конфигурации Grafana proxy</p>
            </div>
          </div>
          <button
            onClick={handleRunTests}
            className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-semibold rounded-lg shadow-lg shadow-green-500/20 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Запустить тесты
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Summary Cards */}
        {hasRun && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400 mb-1">Всего тестов</div>
              <div className="text-3xl font-bold text-white">{tests.length}</div>
            </div>
            <div className="bg-gray-900 border border-green-900/50 rounded-xl p-4">
              <div className="text-sm text-green-400 mb-1">✓ Пройдено</div>
              <div className="text-3xl font-bold text-green-400">{passedCount}</div>
            </div>
            <div className="bg-gray-900 border border-yellow-900/50 rounded-xl p-4">
              <div className="text-sm text-yellow-400 mb-1">⚠ Предупреждения</div>
              <div className="text-3xl font-bold text-yellow-400">{warnCount}</div>
            </div>
            <div className="bg-gray-900 border border-red-900/50 rounded-xl p-4">
              <div className="text-sm text-red-400 mb-1">✗ Ошибки</div>
              <div className="text-3xl font-bold text-red-400">{failedCount}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config Editor */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-sm text-gray-400 ml-2">/etc/nginx/conf.d/grafana.conf</span>
            </div>
            <ConfigEditor value={config} onChange={setConfig} />
          </div>

          {/* Test Results */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Результаты тестирования
              </h2>
            </div>
            <TestResults tests={tests} hasRun={hasRun} />
          </div>
        </div>

        {/* Detailed Analysis */}
        {hasRun && tests.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Подробный анализ
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {tests.filter(t => t.status !== 'pass').map((test, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    test.status === 'fail'
                      ? 'bg-red-950/30 border-red-900/50'
                      : 'bg-yellow-950/30 border-yellow-900/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">
                      {test.status === 'fail' ? '❌' : '⚠️'}
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm">{test.name}</h4>
                      <p className="text-sm text-gray-400 mt-1">{test.message}</p>
                      {test.suggestion && (
                        <div className="mt-2 p-2 bg-gray-800/50 rounded text-xs font-mono text-green-400">
                          💡 {test.suggestion}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {tests.filter(t => t.status !== 'pass').length === 0 && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-green-400 font-semibold">Все тесты пройдены!</p>
                  <p className="text-sm text-gray-400 mt-1">Конфигурация выглядит корректно.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
