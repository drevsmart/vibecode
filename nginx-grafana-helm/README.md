# Nginx Grafana Helm Chart

Helm chart для развёртывания Nginx в качестве reverse proxy для Grafana с режимом только для чтения (Read-Only Mode).

## Описание

Этот chart основан на официальном Nginx image и включает специальную конфигурацию для:
- Блокировки операций редактирования в Grafana (POST, PUT, DELETE, PATCH)
- Разрешения операций чтения (GET) для всех эндпоинтов
- Исключений для критически важных путей (datasources proxy, resources, stars)

## Установка

```bash
helm install my-release ./nginx-grafana-helm
```

## Конфигурация

| Параметр | Описание | Значение по умолчанию |
|----------|----------|----------------------|
| `replicaCount` | Количество реплик | `1` |
| `image.repository` | Docker образ Nginx | `nginx` |
| `image.tag` | Тег образа | `1.26.0` |
| `grafana.upstream.server` | Адрес сервера Grafana | `127.0.0.1:3000` |
| `grafana.serverName` | Server name для Nginx | `grafana.example.com` |
| `grafana.ssl.enabled` | Включить SSL | `false` |
| `grafana.ssl.certificate` | Путь к SSL сертификату | `/etc/nginx/ssl/grafana.crt` |
| `grafana.ssl.certificateKey` | Путь к SSL ключу | `/etc/nginx/ssl/grafana.key` |

## Блокируемые эндпоинты

Следующие API эндпоинты блокируются для методов кроме GET:
- `/api/dashboards/*` - управление дашбордами
- `/api/datasources/*` - управление источниками данных (кроме proxy и resources)
- `/api/library-elements/*` - библиотечные панели
- `/api/folders/*` - папки
- `/api/ruler/*` - правила алертинга
- `/api/v1/provisioning/*` - provisioning API
- `/api/alerts/*` - legacy алерты
- `/api/alert-notifications/*` - уведомления алертов
- `/api/annotations/*` - аннотации
- `/api/users/*`, `/api/teams/*`, `/api/org/*` - пользователи и организации
- `/api/serviceaccounts/*`, `/api/auth/keys/*` - сервисные аккаунты и API ключи

## Исключения

Следующие пути всегда разрешены для всех методов:
- `/api/dashboards/uid/{uid}/stars` - звёздочки (избранное)
- `/api/datasources/proxy/*` - proxy запросы к источникам данных
- `/api/datasources/{uid|id}/resources/*` - backend resources датасорсов

## Пример установки с кастомными значениями

```bash
helm install my-release ./nginx-grafana-helm \
  --set grafana.upstream.server="grafana-service:3000" \
  --set grafana.serverName="grafana.mydomain.com" \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host="grafana.mydomain.com"
```

## Включение SSL

```bash
helm install my-release ./nginx-grafana-helm \
  --set grafana.ssl.enabled=true \
  --set grafana.ssl.certificate="/etc/nginx/ssl/tls.crt" \
  --set grafana.ssl.certificateKey="/etc/nginx/ssl/tls.key"
```

Примечание: При включении SSL необходимо смонтировать сертификаты через volumes или использовать external secrets.
