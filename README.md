# UserService

Микросервис профилей пользователей платформы **Tapik**. Хранит публичные данные профиля (имя, био, аватар), кэширует их в Redis, реагирует на события регистрации и обновления аватара от других сервисов.

## Роль в системе

```
AuthService ──user.registered──▶┐
                                  ├─▶ UserService (profile.controller / profile-events.controller)
MediaService ──avatar.updated──▶┘
                                  │
Клиент ──GET/PATCH /users/me────▶┘ (JWT)
```

UserService не публикует событий сам — только потребляет `user.registered` (создаёт профиль) и `avatar.updated` (обновляет `avatarUrl`), плюс отдаёт профиль по HTTP.

## Технологии

- **NestJS 11** (TypeScript), гибридное приложение (HTTP + RabbitMQ consumer)
- **PostgreSQL** через **Prisma**
- **Redis** (ioredis) — read-through кэш профиля, TTL 300 секунд
- **RabbitMQ** consumer, очередь `user_events`
- Path-алиасы: `@common/*`, `@modules/*`

## Возможности

- `GET /users/me` — профиль текущего пользователя, с кэшем в Redis.
- `PATCH /users/me` — обновление username/bio/avatarUrl, инвалидация кэша по тому же ключу, что использовался при записи.
- Идемпотентное создание профиля по `user.registered` — при повторной доставке события (redelivery) не падает на unique-constraint, а тихо пропускает.
- Обновление `avatarUrl` по событию `avatar.updated` от MediaService/ImageProxyService.

## API

| Метод   | Путь        | Guard          | Описание                                   |
| ------- | ----------- | -------------- | ------------------------------------------ |
| `GET`   | `/users/me` | `JwtAuthGuard` | Получить свой профиль (из кэша, если есть) |
| `PATCH` | `/users/me` | `JwtAuthGuard` | Обновить `username` / `bio` / `avatarUrl`  |

### `PATCH /users/me`

```json
{
  "username": "alice",
  "bio": "hi there",
  "avatarUrl": "https://cdn.tapik.dev/avatars/u1.png"
}
```

Все поля опциональны. `avatarUrl` валидируется как настоящий URL (`@IsUrl()`).

## Потребляемые события RabbitMQ (очередь `user_events`)

| Событие           | Источник     | Действие                                                                  |
| ----------------- | ------------ | ------------------------------------------------------------------------- |
| `user.registered` | AuthService  | Создаёт `Profile` (`userId`, `email`, `username`), если ещё не существует |
| `avatar.updated`  | MediaService | Обновляет `avatarUrl` профиля, инвалидирует кэш                           |

Оба обработчика валидируют payload через `class-validator` DTO и оборачивают вызов сервиса в `try/catch` — ошибка обработки одного события логируется, но не роняет consumer. Если обработка не удалась (например транзиентный сбой БД), событие дополнительно публикуется в `USER_EVENTS_DLQ` (очередь `user_events_dlq`, `user_events.dead_letter`) — раньше такой сбой означал тихую потерю события навсегда (consumer всё равно ack'ает сообщение), и пользователь оставался без профиля молча.

## Внутренний gRPC-сервер: `UserInternal`

Proto: `src/proto/user.proto`. Защищён `InternalGrpcAuthGuard` — каждый вызов обязан нести metadata `x-internal-key`, совпадающий с `INTERNAL_API_KEY`.

| RPC           | Вызывается кем     | Назначение                                                                                                                        |
| ------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `GetProfiles` | AIAssistantService | Пакетный резолвинг `username`/`avatarUrl` по списку `userId` (дайджест непрочитанных, поиск получателя по имени для планирования) |

## Переменные окружения

| Переменная                  | Обязательна                | Назначение                                                             |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `PORT`                      | нет (3001)                 | HTTP-порт                                                              |
| `JWT_SECRET`                | да                         | Проверка access-токенов (общий с AuthService)                          |
| `DATABASE_URL`              | да                         | PostgreSQL                                                             |
| `RABBITMQ_URL`              | да                         | AMQP-подключение, очередь `user_events`                                |
| `REDIS_HOST` / `REDIS_PORT` | нет (`localhost` / `6379`) | Кэш профиля                                                            |
| `INTERNAL_API_KEY`          | да                         | Shared-secret для `UserInternal` gRPC-сервера (сравнение константного времени) |
| `USER_GRPC_URL`             | нет (`0.0.0.0:5003`)       | Адрес, на котором слушает `UserInternal` gRPC-сервер                   |

## Структура проекта

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── auth/      # JwtStrategy, JwtAuthGuard, AuthenticatedRequest
│   ├── prisma/    # PrismaService
│   └── redis/     # RedisService
└── modules/
    └── profile/
        ├── profile.controller.ts        # HTTP
        ├── profile-events.controller.ts # user.registered + avatar.updated consumers, DLQ on failure
        ├── profile.service.ts
        ├── grpc-internal/                # UserInternal сервер (GetProfiles) + guard
        └── dto/                          # UpdateProfileDto, UserRegisteredEventDto, AvatarUpdatedEventDto
```

## Запуск

```bash
npm install
npx prisma generate
npx prisma migrate deploy

npm run start:dev
npm run build && npm run start:prod
npm run test
npm run lint
```

## Безопасность и надёжность

- Кэш профиля инвалидируется строго по тому же ключу (`profile:${userId}`), под которым был записан — раньше здесь была расхождение ключей, из-за которого кэш никогда не сбрасывался; сейчас покрыто регрессионными тестами.
- Создание профиля по `user.registered` устойчиво к повторной доставке события (ловит Prisma unique-constraint вместо гонки check-then-act).
- `avatarUrl` принимается только как валидный URL.
