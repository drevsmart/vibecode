export type Severity = "critical" | "warning" | "info" | "ok";

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  evidence?: string;
  fix?: string;
}

export interface ChangeNote {
  kind: "added" | "changed";
  title: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/*  Исходная конфигурация пользователя                                 */
/* ------------------------------------------------------------------ */

export const ORIGINAL_CONFIG = `# /etc/nginx/conf.d/grafana.conf

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

/* ------------------------------------------------------------------ */
/*  Исправленная конфигурация                                          */
/* ------------------------------------------------------------------ */

export const FIXED_CONFIG = `# /etc/nginx/conf.d/grafana.conf
# Read-Only режим для Grafana + hardening (исправленная версия)

# Лимит запросов: защита от перебора и флуда API (контекст http — для conf.d валидно)
limit_req_zone $binary_remote_addr zone=grafana:10m rate=20r/s;

upstream grafana {
    server 127.0.0.1:3000;
    keepalive 32;                        # пул keepalive-соединений к Grafana
}

# Весь HTTP-трафик — на HTTPS
server {
    listen 80;
    listen [::]:80;                      # удалите строку, если хост без IPv6
    server_name grafana.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;                # nginx >= 1.25.1: замените на "http2 on;"
    listen [::]:443 ssl http2;
    server_name grafana.example.com;

    ssl_certificate     /etc/nginx/ssl/grafana.crt;
    ssl_certificate_key /etc/nginx/ssl/grafana.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    limit_req zone=grafana burst=50 nodelay;

    # Долгие запросы к Prometheus/Loki не будут обрываться на дефолтных 60s
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # =====================================================
    # 1. ИСКЛЮЧЕНИЯ — строго ВЫШЕ ограничивающих блоков
    #    (nginx берёт ПЕРВЫЙ совпавший regex-location)
    # =====================================================

    # Звёздочки (избранное) на дашбордах
    location ~ ^/api/dashboards/uid/[^/]+/stars$ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Proxy-запросы к источникам данных (Prometheus, Loki, InfluxDB и др.)
    location ~ ^/api/datasources/proxy/ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Resources-запросы источников данных (плагины и некоторые DS)
    location ~ ^/api/datasources/uid/[^/]+/resources/ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Resources плагинов (DS-плагины ходят сюда; не дать общему блоку plugins)
    location ~ ^/api/plugins/[^/]+/resources/ {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # =====================================================
    # 2. ОГРАНИЧЕНИЯ — только GET/HEAD, остальное -> 403
    # =====================================================

    # Дашборды: создание, сохранение, импорт, удаление
    location ~ ^/api/dashboards/ {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Управление источниками данных (proxy/resources обработаны выше)
    location ~ ^/api/datasources(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Библиотечные панели
    location ~ ^/api/library-elements(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Папки
    location ~ ^/api/folders(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Unified Alerting (Grafana 9+): provisioning API
    location ~ ^/api/v1/provisioning/ {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Unified Alerting (Grafana 9+): ruler API — создание/удаление alert-правил
    location ~ ^/api/ruler/ {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Legacy Alerting (Grafana < 9) — явные правила вместо хрупкой альтернативы
    location ~ ^/api/alerts(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    location ~ ^/api/alert-notifications(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Аннотации на графиках
    location ~ ^/api/annotations(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Снапшоты: POST публикует дашборд наружу — канал утечки данных
    location ~ ^/api/snapshots(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # Пользователи: /api/user (пароль, e-mail, смена org) + users/teams/orgs
    location ~ ^/api/(user|users|teams|org|orgs)(/|$) {
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

    # Плагины: запрет install/update/uninstall (список по GET остаётся)
    location ~ ^/api/plugins(/|$) {
        limit_except GET { deny all; }
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;
    }

    # =====================================================
    # Всё остальное — login, /api/ds/query, поиск и т.д.
    # =====================================================
    location / {
        proxy_pass http://grafana;
        include /etc/nginx/proxy_params_grafana.conf;

        # WebSocket / live-обновления Grafana
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}`;

/* ------------------------------------------------------------------ */
/*  Журнал внесённых изменений                                         */
/* ------------------------------------------------------------------ */

export const CHANGES: ChangeNote[] = [
  {
    kind: "added",
    title: "Блокировка /api/ruler/",
    detail:
      "В Grafana 9+ alert-правила создаются и удаляются через POST/DELETE /api/ruler/grafana/api/v1/rules/<namespace>. Был закрыт только /api/v1/provisioning/ — второй путь записи оставался открытым и сводил read-only на нет.",
  },
  {
    kind: "changed",
    title: "/api/user добавлен в защищаемые пути",
    detail:
      "Было: ^/api/(users|teams|org|orgs)(/|$) — не матчит /api/user/... Стало: (user|users|teams|org|orgs). Закрывает PUT /api/user/password (смена пароля), /api/user/emails и POST /api/user/org (смена организации).",
  },
  {
    kind: "added",
    title: "Блокировка /api/plugins + исключение для plugin resources",
    detail:
      "POST /api/plugins/<id>/install позволял устанавливать плагины, а это фактически выполнение произвольного кода на сервере. Исключение ^/api/plugins/[^/]+/resources/ стоит выше и сохраняет работу DS-плагинов.",
  },
  {
    kind: "added",
    title: "Блокировка /api/snapshots",
    detail:
      "POST /api/snapshots публикует дашборд как публичный снимок на /dashboard/snapshot/... — прямой канал утечки данных в обход всех ограничений на дашборды.",
  },
  {
    kind: "added",
    title: "HTTPS + редирект 301",
    detail:
      "Отдельный server на :80 с return 301 https://$host$request_uri; основной сервер слушает 443 ssl, разрешены только TLSv1.2/1.3. Логины и cookies Grafana больше не ходят открытым текстом.",
  },
  {
    kind: "added",
    title: "limit_req_zone + limit_req",
    detail:
      "20 r/s на IP, burst=50 nodelay. Защита от перебора API и флуда тяжёлыми запросами к datasource. Директива limit_req_zone валидна в conf.d (контекст http).",
  },
  {
    kind: "added",
    title: "proxy_read_timeout / proxy_send_timeout 300s",
    detail:
      "Долгие запросы к Prometheus/Loki (range-запросы за большие периоды) обрывались бы на дефолтных 60 секундах с ошибкой 504.",
  },
  {
    kind: "added",
    title: "WebSocket в location /",
    detail:
      "proxy_http_version 1.1 + Upgrade/Connection — без этого live-обновления и стриминг Grafana не работают через прокси.",
  },
  {
    kind: "added",
    title: "keepalive 32 в upstream",
    detail:
      "Пул переиспользуемых соединений к Grafana: меньше handshake'ов, ниже латентность при высокой частоте запросов панелей.",
  },
  {
    kind: "added",
    title: "Security headers (always)",
    detail:
      "X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy. Флаг always обязателен, иначе заголовки не добавляются к ответам с кодом >= 400.",
  },
  {
    kind: "changed",
    title: "Явные regex для legacy alerting",
    detail:
      "Вместо ^/api/alert(s|-notifications) — два явных блока ^/api/alerts(/|$) и ^/api/alert-notifications(/|$). Смысл тот же, но без неоднозначной ветки без границы.",
  },
];

/* ------------------------------------------------------------------ */
/*  Движок аудита                                                      */
/* ------------------------------------------------------------------ */

const stripComments = (cfg: string) =>
  cfg
    .split("\n")
    .map((l) => (l.trim().startsWith("#") ? "" : l))
    .join("\n");

export function auditConfig(raw: string): Finding[] {
  const active = stripComments(raw);
  const has = (re: RegExp) => re.test(active);
  const f: Finding[] = [];
  const push = (severity: Severity, id: string, category: string, title: string, detail: string, evidence?: string, fix?: string) =>
    f.push({ id, severity, category, title, detail, evidence, fix });

  /* --- Синтаксис --- */

  const open = (raw.match(/\{/g) || []).length;
  const close = (raw.match(/\}/g) || []).length;
  if (open === close) {
    push("ok", "braces", "Синтаксис", "Скобки сбалансированы", `Открывающих и закрывающих скобок поровну: ${open}. Блоки upstream/server/location/location-limit закрыты корректно.`);
  } else {
    push("critical", "braces", "Синтаксис", "Дисбаланс скобок", `Открывающих: ${open}, закрывающих: ${close}. nginx -t вернёт unexpected end of file.`);
  }

  const patterns = [...active.matchAll(/location\s+~\s*([^\s{]+)/g)].map((m) => m[1]);
  let badRe = 0;
  patterns.forEach((p) => {
    try {
      new RegExp(p);
    } catch {
      badRe++;
    }
  });
  if (badRe === 0) {
    push("ok", "regex", "Синтаксис", `Regex-паттерны валидны (${patterns.length} шт.)`, "Все регулярные выражения в location ~ компилируются без ошибок.");
  } else {
    push("critical", "regex", "Синтаксис", `${badRe} невалидных regex`, "nginx не стартует: pcre_compile() failed. Проверьте escape-последовательности.");
  }

  if (has(/upstream\s+grafana\s*\{/)) {
    push("ok", "upstream", "Синтаксис", "upstream grafana определён", "server 127.0.0.1:3000 — Grafana по умолчанию слушает именно этот адрес.");
  } else {
    push("critical", "upstream", "Синтаксис", "upstream grafana не найден", "proxy_pass http://grafana не сможет резолвиться — host not found in upstream.");
  }

  if (has(/location\s+\/\s*\{/)) {
    push("ok", "catchall", "Синтаксис", "Catch-all location / есть", "Всё, что не попало в regex-блоки (login, статика, /api/ds/query), проксируется в Grafana.");
  } else {
    push("warning", "catchall", "Синтаксис", "Нет catch-all location /", "Запросы вне перечисленных API-путей получат 404 вместо проксирования.");
  }

  if (has(/server_name\s+[\w.*-]+/)) {
    push("ok", "servername", "Синтаксис", "server_name задан", "Виртуальный хост grafana.example.com привязан к server-блоку.");
  } else {
    push("info", "servername", "Синтаксис", "server_name не задан", "Блок станет default-сервером и примет любой Host-заголовок на этом порту.");
  }

  /* --- Порядок location (regex берутся по ПЕРВОМУ совпадению) --- */

  const orderCheck = (
    id: string,
    title: string,
    excMarker: string,
    genMarker: string,
    okDetail: string,
    failDetail: string,
  ) => {
    const a = active.indexOf(excMarker);
    const b = active.indexOf(genMarker);
    if (a === -1 || b === -1) return;
    if (a < b) push("ok", id, "Порядок location", title, okDetail);
    else push("critical", id, "Порядок location", title, failDetail, undefined, "Переместите location-исключение ВЫШЕ общего ограничивающего блока.");
  };

  orderCheck(
    "order-stars",
    "Исключение stars стоит выше /api/dashboards/",
    "^/api/dashboards/uid/[^/]+/stars$",
    "^/api/dashboards/ {",
    "PUT/DELETE на «звёздочку» попадёт в разрешающий блок, т.к. nginx берёт первый совпавший regex.",
    "Общий блок ^/api/dashboards/ перехватит запрос раньше — избранное перестанет работать (403).",
  );
  orderCheck(
    "order-proxy",
    "Исключение datasources/proxy выше управления DS",
    "^/api/datasources/proxy/",
    "^/api/datasources(/|$)",
    "POST-запросы к Prometheus/Loki не будут зарезаны limit_except общего блока.",
    "POST-запросы к источникам данных попадут под deny all — все панели лягут.",
  );
  orderCheck(
    "order-resources",
    "Исключение datasources/.../resources выше управления DS",
    "^/api/datasources/uid/[^/]+/resources/",
    "^/api/datasources(/|$)",
    "Resources-вызовы плагинов и DS пройдут без ограничений.",
    "Resources-запросы будут заблокированы — часть datasource-плагинов сломается.",
  );
  orderCheck(
    "order-plugin-res",
    "Исключение plugin resources выше /api/plugins",
    "^/api/plugins/[^/]+/resources/",
    "^/api/plugins(/|$)",
    "DS-плагины продолжат ходить в свои resources, хотя install/update запрещены.",
    "Общий блок plugins перехватит resources-вызовы плагинов.",
  );

  /* --- Покрытие Read-Only (критичные дыры) --- */

  if (has(/location\s+~\s+\^\/api\/ruler\//)) {
    push("ok", "ruler", "Read-Only защита", "Unified Alerting: ruler API закрыт", "POST/DELETE /api/ruler/grafana/api/v1/rules/<namespace> вернёт 403 — alert-правила не изменить.");
  } else {
    push(
      "critical",
      "ruler",
      "Read-Only защита",
      "/api/ruler/ открыт на запись — alert-правила можно менять",
      "Grafana 9+ применяет изменения alert-правил через POST/DELETE /api/ruler/grafana/api/v1/rules/<namespace>. Закрытый /api/v1/provisioning/ — лишь один из двух путей записи.",
      "location ~ ^/api/dashboards/ { ... } — а /api/ruler/ ничем не ограничен",
      "location ~ ^/api/ruler/ {\n    limit_except GET { deny all; }\n    proxy_pass http://grafana;\n    include /etc/nginx/proxy_params_grafana.conf;\n}",
    );
  }

  const userBlocked =
    has(/location\s+~\s+[^\n{]*\^\/api\/\(user\|/) || has(/location\s+~\s+\^\/api\/user\(\/\|\$\)/);
  if (userBlocked) {
    push("ok", "user", "Read-Only защита", "/api/user защищён", "Смена пароля (PUT /api/user/password), e-mail и организации недоступна.");
  } else {
    push(
      "critical",
      "user",
      "Read-Only защита",
      "/api/user/* не защищён — смена пароля и e-mail доступна",
      "Паттерн ^/api/(users|teams|org|orgs)(/|$) не матчит /api/user/... (без «s» на конце). Любой залогиненный пользователь может сделать PUT /api/user/password и POST /api/user/org.",
      "location ~ ^/api/(users|teams|org|orgs)(/|$)",
      "location ~ ^/api/(user|users|teams|org|orgs)(/|$) {\n    limit_except GET { deny all; }\n    ...\n}",
    );
  }

  if (has(/location\s+~\s+\^\/api\/plugins\(\/\|\$\)/)) {
    push("ok", "plugins", "Read-Only защита", "/api/plugins закрыт на запись", "Установка/обновление/удаление плагинов запрещена — GET-список работает.");
  } else {
    push(
      "critical",
      "plugins",
      "Read-Only защита",
      "/api/plugins — возможна установка плагинов",
      "POST /api/plugins/<id>/install скачивает и разворачивает код плагина на сервере. Для read-only стенда это фактически remote code execution для любого, у кого есть доступ к UI.",
      undefined,
      "location ~ ^/api/plugins(/|$) {\n    limit_except GET { deny all; }\n    ...\n}\n# и выше — исключение:\nlocation ~ ^/api/plugins/[^/]+/resources/ { ... }",
    );
  }

  if (has(/location\s+~\s+\^\/api\/snapshots\(\/\|\$\)/)) {
    push("ok", "snapshots", "Read-Only защита", "/api/snapshots закрыт", "Публикация дашбордов наружу через снапшоты запрещена.");
  } else {
    push(
      "critical",
      "snapshots",
      "Read-Only защита",
      "/api/snapshots — публикация данных наружу",
      "POST /api/snapshots создаёт публичный снимок дашборда, доступный по /dashboard/snapshot/<key> вообще без авторизации. Это обход всей read-only защиты и канал утечки метрик.",
      undefined,
      "location ~ ^/api/snapshots(/|$) {\n    limit_except GET { deny all; }\n    ...\n}",
    );
  }

  if (has(/location\s+~\s+\^\/api\/dashboards\/\s*\{/) && has(/limit_except\s+GET/)) {
    push("ok", "dashboards", "Read-Only защита", "Дашборды: запись запрещена", "POST /api/dashboards/db, /import, DELETE по uid — всё вернёт 403. Просмотр (GET) работает.");
  }

  if (has(/location\s+~\s+\^\/api\/v1\/provisioning\//)) {
    push("ok", "provisioning", "Read-Only защита", "Provisioning API закрыт", "Правила, contact points и notification policies не изменить через UI.");
  }

  const crudMisses = [
    ["^/api/datasources(/|$)", "управление datasource"],
    ["^/api/library-elements(/|$)", "library panels"],
    ["^/api/folders(/|$)", "папки"],
    ["^/api/annotations(/|$)", "аннотации"],
    ["^/api/(serviceaccounts|auth/keys)(/|$)", "сервис-аккаунты и ключи"],
  ].filter(([marker]) => !active.includes(marker as string));
  if (crudMisses.length === 0) {
    push("ok", "crud", "Read-Only защита", "CRUD-поверхность закрыта полностью", "Datasources, library panels, папки, аннотации, сервис-аккаунты и API-ключи — только чтение.");
  } else {
    push("warning", "crud", "Read-Only защита", "Не закрыты: " + crudMisses.map(([, n]) => n).join(", "), "Часть CRUD-API осталась доступна на запись.");
  }

  const explicitAlerts =
    has(/location\s+~\s+\^\/api\/alerts\(\/\|\$\)/) && has(/location\s+~\s+\^\/api\/alert-notifications\(\/\|\$\)/);
  const fragileAlerts = has(/location\s+~\s+\^\/api\/alert\(s\|-notifications\)/);
  if (explicitAlerts) {
    push("ok", "legacy-alerts", "Read-Only защита", "Legacy alerting закрыт явными правилами", "Отдельные блоки для /api/alerts и /api/alert-notifications — без неоднозначных альтернатив.");
  } else if (fragileAlerts) {
    push(
      "info",
      "legacy-alerts",
      "Read-Only защита",
      "Regex ^/api/alert(s|-notifications) работает, но хрупкий",
      "Ветка «s» не имеет правой границы: паттерн матчит /api/alerts/..., но читается тяжело и легко ломается при правках. Лучше два явных блока с (\\/|$).",
      "location ~ ^/api/alert(s|-notifications) {",
      "location ~ ^/api/alerts(/|$) { ... }\nlocation ~ ^/api/alert-notifications(/|$) { ... }",
    );
  } else {
    push("warning", "legacy-alerts", "Read-Only защита", "Legacy alerting не закрыт", "Для Grafana < 9 нужно блокировать /api/alerts и /api/alert-notifications.");
  }

  if (has(/location\s+~?\s*[^\n]*\^\/api\/ds\/query/)) {
    push("warning", "dsquery", "Read-Only защита", "/api/ds/query заблокирован — панели не будут получать данные", "Этот endpoint использует POST для всех запросов панелей в Grafana 8+. Его блокировать нельзя.");
  } else {
    push("ok", "dsquery", "Read-Only защита", "/api/ds/query открыт", "POST-запросы данных для панелей проходят свободно — графики будут рисоваться.");
  }

  const leCount = (active.match(/limit_except\s+GET/g) || []).length;
  if (leCount >= 13) push("ok", "limit-except", "Read-Only защита", `${leCount} фильтров limit_except GET`, "Все ограничивающие блоки используют корректную конструкцию limit_except GET { deny all; } — GET и HEAD разрешены, остальное получает 403.");
  else if (leCount > 0) push("info", "limit-except", "Read-Only защита", `limit_except GET: ${leCount} шт.`, "Ожидалось больше ограничивающих блоков — проверьте покрытие API.");
  else push("warning", "limit-except", "Read-Only защита", "limit_except не используется", "Read-only режим фактически не настроен.");

  if (has(/proxy_pass\s+http:\/\/grafana;/) && !has(/proxy_pass\s+http:\/\/grafana\//)) {
    push("ok", "proxypass", "Синтаксис", "proxy_pass без URI-части", "В regex-location путь передаётся в Grafana как есть — ничего не обрезается и не переписывается.");
  }

  /* --- Сеть, TLS, эксплуатация --- */

  if (has(/listen\s+443\s+ssl/)) {
    push("ok", "tls", "Сеть и TLS", "HTTPS активен", "Трафик шифруется, ssl_protocols ограничивают версии TLS.");
  } else {
    push(
      "warning",
      "tls",
      "Сеть и TLS",
      "Трафик идёт по открытому HTTP",
      "Логины, сессионные cookies Grafana и метрики передаются в открытом виде. SSL-строки закомментированы.",
      "# listen 443 ssl http2;",
      "Выделите :80 под редирект, а основной server поднимите на 443 ssl с сертификатом (например, Let's Encrypt).",
    );
  }

  if (has(/return\s+301\s+https:\/\//)) {
    push("ok", "redirect", "Сеть и TLS", "Редирект HTTP → HTTPS", "return 301 переводит всех клиентов на защищённый endpoint.");
  } else {
    push(
      "warning",
      "redirect",
      "Сеть и TLS",
      "Нет редиректа на HTTPS",
      "Даже при включённом TLS клиенты смогут ходить по HTTP — нужен отдельный server-блок с return 301.",
      undefined,
      "server {\n    listen 80;\n    server_name grafana.example.com;\n    return 301 https://$host$request_uri;\n}",
    );
  }

  if (has(/proxy_read_timeout/)) {
    push("ok", "timeouts", "Сеть и TLS", "Таймауты прокси заданы", "Долгие запросы к хранилищам метрик не обрываются.");
  } else {
    push(
      "warning",
      "timeouts",
      "Сеть и TLS",
      "Таймауты по умолчанию (60s)",
      "proxy_read_timeout по умолчанию 60 секунд: range-запрос к Prometheus за большой период вернёт 504 Gateway Time-out.",
      undefined,
      "proxy_read_timeout 300s;\nproxy_send_timeout 300s;",
    );
  }

  if (has(/proxy_set_header\s+Upgrade\s+\$http_upgrade/i)) {
    push("ok", "websocket", "Сеть и TLS", "WebSocket-заголовки настроены", "Upgrade/Connection проброшены — live-обновления Grafana работают.");
  } else {
    push(
      "warning",
      "websocket",
      "Сеть и TLS",
      "WebSocket не настроен явно",
      "Без proxy_http_version 1.1 и заголовков Upgrade/Connection live-функции Grafana деградируют до опроса. Проверьте proxy_params_grafana.conf — если их нет и там, добавьте.",
      undefined,
      'proxy_http_version 1.1;\nproxy_set_header Upgrade $http_upgrade;\nproxy_set_header Connection "upgrade";',
    );
  }

  if (has(/limit_req_zone/) && has(/limit_req\s+zone=/)) {
    push("ok", "ratelimit", "Эксплуатация", "Rate limiting активен", "limit_req_zone + limit_req защищают API от перебора и флуда.");
  } else {
    push(
      "warning",
      "ratelimit",
      "Эксплуатация",
      "Нет rate limiting",
      "API Grafana открыт для brute-force и тяжёлых серий запросов. limit_req_zone валиден прямо в conf.d (http-контекст).",
      undefined,
      "limit_req_zone $binary_remote_addr zone=grafana:10m rate=20r/s;\n# в server-блоке:\nlimit_req zone=grafana burst=50 nodelay;",
    );
  }

  if (has(/add_header\s+(X-Frame-Options|X-Content-Type-Options)/)) {
    push("ok", "headers", "Эксплуатация", "Security headers заданы", "Заголовки добавляются с флагом always — в том числе к ошибкам 4xx.");
  } else {
    push(
      "info",
      "headers",
      "Эксплуатация",
      "Нет HTTP security headers",
      "X-Frame-Options / X-Content-Type-Options / Referrer-Policy стоит задавать на уровне прокси, даже если Grafana шлёт свои.",
      undefined,
      'add_header X-Frame-Options SAMEORIGIN always;\nadd_header X-Content-Type-Options nosniff always;',
    );
  }

  if (has(/listen\s+\[::\]/)) {
    push(
      "info",
      "ipv6",
      "Эксплуатация",
      "listen [::] — проверьте IPv6 на хосте",
      "Если ядро собрано без IPv6, nginx не стартует: socket() [::]:80 failed (97: Address family not supported). На таких машинах строки [::] нужно убрать.",
      "listen [::]:80;",
    );
  }

  if (has(/keepalive\s+\d+/)) {
    push("ok", "keepalive", "Эксплуатация", "keepalive в upstream", "Соединения к Grafana переиспользуются, латентность проксирования ниже.");
  } else {
    push(
      "info",
      "keepalive",
      "Эксплуатация",
      "upstream без keepalive",
      "Каждый запрос открывает новое TCP-соединение к Grafana. keepalive 32 в upstream заметно ускоряет массовые запросы панелей.",
      "upstream grafana {\n    server 127.0.0.1:3000;\n}",
      "upstream grafana {\n    server 127.0.0.1:3000;\n    keepalive 32;\n}",
    );
  }

  if (has(/include\s+[^\n;]*proxy_params[^\n;]*;/)) {
    push("ok", "include", "Эксплуатация", "include proxy_params во всех location", "Общие proxy_set_header вынесены в отдельный файл. Убедитесь, что /etc/nginx/proxy_params_grafana.conf существует, иначе nginx -t упадёт.");
  }

  return f;
}

export function scoreOf(findings: Finding[]): number {
  const crit = findings.filter((x) => x.severity === "critical").length;
  const warn = findings.filter((x) => x.severity === "warning").length;
  const info = findings.filter((x) => x.severity === "info").length;
  return Math.max(0, Math.min(100, Math.round(100 - crit * 14 - warn * 5 - info * 1)));
}

export function countBy(findings: Finding[]) {
  return {
    critical: findings.filter((x) => x.severity === "critical").length,
    warning: findings.filter((x) => x.severity === "warning").length,
    info: findings.filter((x) => x.severity === "info").length,
    ok: findings.filter((x) => x.severity === "ok").length,
  };
}

/* ------------------------------------------------------------------ */
/*  Diff-утилиты                                                       */
/* ------------------------------------------------------------------ */

export function addedLines(original: string, fixed: string): Set<number> {
  const orig = new Set(original.split("\n").map((l) => l.trim()).filter(Boolean));
  const out = new Set<number>();
  fixed.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t && !orig.has(t)) out.add(i + 1);
  });
  return out;
}

export function changedLines(original: string, fixed: string): Set<number> {
  const fix = new Set(fixed.split("\n").map((l) => l.trim()).filter(Boolean));
  const out = new Set<number>();
  original.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t && !t.startsWith("#") && !fix.has(t)) out.add(i + 1);
  });
  return out;
}
