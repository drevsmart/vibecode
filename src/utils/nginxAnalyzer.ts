export interface ConfigTest {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  suggestion?: string;
}

export function runTests(config: string): ConfigTest[] {
  const tests: ConfigTest[] = [];

  // === SYNTAX CHECKS ===

  // 1. Check upstream block exists
  tests.push({
    name: 'Upstream блок определён',
    category: 'Синтаксис',
    status: config.includes('upstream grafana') ? 'pass' : 'fail',
    message: config.includes('upstream grafana')
      ? 'Upstream блок "grafana" найден.'
      : 'Upstream блок "grafana" не найден. Проксирование не будет работать.',
    suggestion: !config.includes('upstream grafana')
      ? 'Добавьте: upstream grafana { server 127.0.0.1:3000; }'
      : undefined,
  });

  // 2. Check server block
  tests.push({
    name: 'Server блок определён',
    category: 'Синтаксис',
    status: config.includes('server {') ? 'pass' : 'fail',
    message: config.includes('server {')
      ? 'Server блок найден.'
      : 'Server блок не найден.',
  });

  // 3. Check listen directive
  tests.push({
    name: 'Директива listen присутствует',
    category: 'Синтаксис',
    status: /listen\s+\d+/.test(config) ? 'pass' : 'fail',
    message: /listen\s+\d+/.test(config)
      ? 'Директива listen найдена.'
      : 'Не найдена директива listen. Nginx не будет слушать порт.',
  });

  // 4. Check server_name
  tests.push({
    name: 'Директива server_name присутствует',
    category: 'Синтаксис',
    status: /server_name\s+[\w.]+/.test(config) ? 'pass' : 'warn',
    message: /server_name\s+[\w.]+/.test(config)
      ? 'Директива server_name найдена.'
      : 'server_name не задан. Будет использоваться default server.',
    suggestion: !/server_name\s+[\w.]+/.test(config)
      ? 'Добавьте: server_name grafana.yourdomain.com;'
      : undefined,
  });

  // 5. Check proxy_pass
  const proxyPassCount = (config.match(/proxy_pass\s+http:\/\/grafana/g) || []).length;
  tests.push({
    name: 'Директива proxy_pass настроена',
    category: 'Синтаксис',
    status: proxyPassCount > 0 ? 'pass' : 'fail',
    message: proxyPassCount > 0
      ? `Найдено ${proxyPassCount} директив proxy_pass.`
      : 'Не найдена директива proxy_pass. Трафик не будет проксироваться.',
  });

  // 6. Check balanced braces
  const openBraces = (config.match(/\{/g) || []).length;
  const closeBraces = (config.match(/\}/g) || []).length;
  tests.push({
    name: 'Баланс скобок { }',
    category: 'Синтаксис',
    status: openBraces === closeBraces ? 'pass' : 'fail',
    message: openBraces === closeBraces
      ? `Скобки сбалансированы: ${openBraces} открывающих, ${closeBraces} закрывающих.`
      : `Дисбаланс скобок! ${openBraces} открывающих vs ${closeBraces} закрывающих.`,
    suggestion: openBraces !== closeBraces
      ? 'Проверьте все блоки location, upstream и server на корректное закрытие.'
      : undefined,
  });

  // === LOCATION ORDER CHECKS ===

  // 7. Check that exception locations come before restricted ones
  const starsLocationIdx = config.indexOf('/api/dashboards/uid/[^/]+/stars');
  const dashboardsLocationIdx = config.indexOf('^/api/dashboards/');
  tests.push({
    name: 'Порядок location: исключения до ограничений (dashboards)',
    category: 'Порядок location',
    status: starsLocationIdx < dashboardsLocationIdx ? 'pass' : 'fail',
    message: starsLocationIdx < dashboardsLocationIdx
      ? 'Исключение для stars расположено ВЫШЕ общего правила для dashboards. ✓'
      : 'Исключение для stars должно быть ВЫШЕ общего правила /api/dashboards/. Nginx использует первый найденный regex location.',
    suggestion: starsLocationIdx >= dashboardsLocationIdx
      ? 'Переместите location для stars выше location для /api/dashboards/'
      : undefined,
  });

  const proxyLocationIdx = config.indexOf('/api/datasources/proxy/');
  const datasourcesLocationIdx = config.indexOf('^/api/datasources(/|$)');
  tests.push({
    name: 'Порядок location: исключения до ограничений (datasources)',
    category: 'Порядок location',
    status: proxyLocationIdx < datasourcesLocationIdx ? 'pass' : 'fail',
    message: proxyLocationIdx < datasourcesLocationIdx
      ? 'Исключение для datasources/proxy расположено ВЫШЕ общего правила. ✓'
      : 'Исключение для datasources/proxy должно быть ВЫШЕ общего правила /api/datasources.',
    suggestion: proxyLocationIdx >= datasourcesLocationIdx
      ? 'Переместите location для datasources/proxy выше location для /api/datasources'
      : undefined,
  });

  const resourcesLocationIdx = config.indexOf('/api/datasources/uid/[^/]+/resources/');
  tests.push({
    name: 'Порядок location: resources до ограничений (datasources)',
    category: 'Порядок location',
    status: resourcesLocationIdx < datasourcesLocationIdx ? 'pass' : 'fail',
    message: resourcesLocationIdx < datasourcesLocationIdx
      ? 'Исключение для datasources/resources расположено ВЫШЕ общего правила. ✓'
      : 'Исключение для datasources/resources должно быть ВЫШЕ общего правила /api/datasources.',
    suggestion: resourcesLocationIdx >= datasourcesLocationIdx
      ? 'Переместите location для datasources/resources выше location для /api/datasources'
      : undefined,
  });

  // === SECURITY CHECKS ===

  // 8. Check limit_except usage
  const limitExceptCount = (config.match(/limit_except\s+GET/g) || []).length;
  tests.push({
    name: 'Использование limit_except для read-only',
    category: 'Безопасность',
    status: limitExceptCount >= 7 ? 'pass' : 'warn',
    message: limitExceptCount >= 7
      ? `Найдено ${limitExceptCount} блоков limit_except GET — read-only режим настроен.`
      : `Найдено только ${limitExceptCount} блоков limit_except. Ожидалось минимум 7.`,
    suggestion: limitExceptCount < 7
      ? 'Проверьте, что все критические API endpoints защищены через limit_except GET { deny all; }'
      : undefined,
  });

  // 9. Check deny all in limit_except
  const denyAllCount = (config.match(/deny\s+all/g) || []).length;
  tests.push({
    name: 'Директива deny all в ограничениях',
    category: 'Безопасность',
    status: denyAllCount >= 7 ? 'pass' : 'warn',
    message: denyAllCount >= 7
      ? `Найдено ${denyAllCount} директив deny all.`
      : `Найдено только ${denyAllCount} директив deny all.`,
  });

  // 10. Check HTTPS recommendation
  const hasSSL = config.includes('listen 443 ssl') || config.includes('listen [::]:443 ssl');
  const sslCommented = config.includes('# listen 443 ssl') || config.includes('#listen 443 ssl');
  tests.push({
    name: 'HTTPS/SSL конфигурация',
    category: 'Безопасность',
    status: hasSSL ? 'pass' : sslCommented ? 'warn' : 'fail',
    message: hasSSL
      ? 'HTTPS настроен. ✓'
      : sslCommented
      ? 'SSL закомментирован. Для production рекомендуется включить HTTPS.'
      : 'HTTPS не настроен. Данные передаются в открытом виде!',
    suggestion: !hasSSL
      ? 'Раскомментируйте строки SSL или настройте Let\'s Encrypt: certbot --nginx -d grafana.example.com'
      : undefined,
  });

  // 11. Check for HTTP to HTTPS redirect
  tests.push({
    name: 'Редирект HTTP → HTTPS',
    category: 'Безопасность',
    status: config.includes('return 301 https://') || config.includes('return 302 https://')
      ? 'pass'
      : hasSSL ? 'warn' : 'warn',
    message: config.includes('return 301 https://')
      ? 'Редирект на HTTPS настроен. ✓'
      : 'Редирект с HTTP на HTTPS не настроен.',
    suggestion: 'Добавьте отдельный server блок для редиректа: return 301 https://$host$request_uri;',
  });

  // === FUNCTIONAL CHECKS ===

  // 12. Check catch-all location
  tests.push({
    name: 'Catch-all location /',
    category: 'Функциональность',
    status: /location\s+\/\s*\{/.test(config) ? 'pass' : 'fail',
    message: /location\s+\/\s*\{/.test(config)
      ? 'Catch-all location / найден. Все необработанные запросы будут проксироваться.'
      : 'Catch-all location / не найден. Некоторые запросы могут возвращать 404.',
    suggestion: !/location\s+\/\s*\{/.test(config)
      ? 'Добавьте в конец server блока: location / { proxy_pass http://grafana; }'
      : undefined,
  });

  // 13. Check include proxy_params
  const includeCount = (config.match(/include\s+.*proxy_params/g) || []).length;
  tests.push({
    name: 'Include proxy_params',
    category: 'Функциональность',
    status: includeCount > 0 ? 'pass' : 'warn',
    message: includeCount > 0
      ? `Найдено ${includeCount} директив include для proxy_params.`
      : 'Не найдены директивы include для proxy_params. Убедитесь, что файл существует.',
    suggestion: includeCount === 0
      ? 'Убедитесь, что файл /etc/nginx/proxy_params_grafana.conf существует и содержит нужные директивы (proxy_set_header Host, X-Real-IP и т.д.)'
      : undefined,
  });

  // 14. Check for WebSocket support
  const hasWebsocket = config.includes('Upgrade') || config.includes('upgrade') || config.includes('$http_upgrade');
  tests.push({
    name: 'Поддержка WebSocket',
    category: 'Функциональность',
    status: hasWebsocket ? 'pass' : 'warn',
    message: hasWebsocket
      ? 'WebSocket поддержка обнаружена.'
      : 'WebSocket не настроен. Live-обновления Grafana могут не работать.',
    suggestion: 'Добавьте в proxy_params: proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";',
  });

  // 15. Check regex location syntax
  const regexLocations = config.match(/location\s+~\s+([^\s{]+)/g) || [];
  let regexErrors = 0;
  regexLocations.forEach(loc => {
    const pattern = loc.replace(/location\s+~\s+/, '');
    try {
      new RegExp(pattern);
    } catch {
      regexErrors++;
    }
  });
  tests.push({
    name: 'Синтаксис regex в location',
    category: 'Синтаксис',
    status: regexErrors === 0 ? 'pass' : 'fail',
    message: regexErrors === 0
      ? `Все ${regexLocations.length} regex-паттернов валидны.`
      : `Найдено ${regexErrors} невалидных regex-паттернов!`,
    suggestion: regexErrors > 0
      ? 'Проверьте синтаксис регулярных выражений в location блоках.'
      : undefined,
  });

  // 16. Check for potential path traversal issues
  const hasPathTraversalProtection = config.includes('proxy_pass http://grafana') && !config.includes('proxy_pass http://grafana/');
  tests.push({
    name: 'Защита от path traversal',
    category: 'Безопасность',
    status: hasPathTraversalProtection ? 'pass' : 'warn',
    message: hasPathTraversalProtection
      ? 'proxy_pass без trailing slash — URI передаётся как есть. ✓'
      : 'proxy_pass с trailing slash может изменить URI. Проверьте корректность.',
  });

  // 17. Check alerting endpoints coverage
  const hasUnifiedAlerting = config.includes('/api/v1/provisioning/');
  const hasLegacyAlerting = config.includes('/api/alert');
  tests.push({
    name: 'Покрытие Alerting endpoints',
    category: 'Функциональность',
    status: hasUnifiedAlerting && hasLegacyAlerting ? 'pass' : 'warn',
    message: hasUnifiedAlerting && hasLegacyAlerting
      ? 'Оба типа alerting (Unified и Legacy) защищены. ✓'
      : !hasUnifiedAlerting
      ? 'Unified Alerting (Grafana 9+) не защищён.'
      : 'Legacy Alerting не защищён.',
    suggestion: 'Убедитесь, что оба типа alerting endpoints заблокированы для записи.',
  });

  // 18. Check annotations endpoint
  const hasAnnotations = config.includes('/api/annotations');
  tests.push({
    name: 'Защита annotations endpoint',
    category: 'Функциональность',
    status: hasAnnotations ? 'pass' : 'warn',
    message: hasAnnotations
      ? 'Annotations endpoint защищён от записи. ✓'
      : 'Annotations endpoint не защищён. Пользователи смогут создавать аннотации.',
  });

  // 19. Check for rate limiting
  const hasRateLimit = config.includes('limit_req') || config.includes('limit_conn');
  tests.push({
    name: 'Rate limiting',
    category: 'Безопасность',
    status: hasRateLimit ? 'pass' : 'warn',
    message: hasRateLimit
      ? 'Rate limiting настроен. ✓'
      : 'Rate limiting не настроен. API может быть подвержен abuse.',
    suggestion: 'Рассмотрите добавление limit_req_zone и limit_req для защиты от перегрузки.',
  });

  // 20. Check for security headers
  const hasSecurityHeaders = config.includes('add_header') && (
    config.includes('X-Frame-Options') ||
    config.includes('X-Content-Type') ||
    config.includes('Content-Security-Policy')
  );
  tests.push({
    name: 'HTTP security headers',
    category: 'Безопасность',
    status: hasSecurityHeaders ? 'pass' : 'warn',
    message: hasSecurityHeaders
      ? 'Security headers настроены. ✓'
      : 'HTTP security headers не обнаружены.',
    suggestion: 'Добавьте: add_header X-Frame-Options "SAMEORIGIN"; add_header X-Content-Type-Options "nosniff";',
  });

  return tests;
}
