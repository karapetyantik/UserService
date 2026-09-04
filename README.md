# UserService — подробная документация (все файлы)

Микросервис профилей пользователей. Хранилище — PostgreSQL через Prisma. Создаёт профиль при регистрации пользователя (слушая событие `user.registered` от `AuthService`), отдаёт и обновляет профиль текущего пользователя, обновляет URL аватара по событию от `MediaService`.

---

## 1. Дерево модуля

```
src/
├── main.ts
├── app.module.ts / app.controller.ts / app.service.ts
├── auth/        (jwt.strategy.ts, jwt-auth.guard.ts, auth.module.ts — только валидация JWT, не выпуск)
├── prisma/      (prisma.module.ts, prisma.service.ts)
├── redis/       (redis.module.ts, redis.service.ts)
└── profile/
    ├── profile.module.ts
    ├── profile.controller.ts          — REST (/users/*) + событие user.registered
    ├── profile-events.controller.ts   — событие avatar.updated
    ├── profile.service.ts
    └── dto/update-profile.dto.ts
```

---

## 2. `main.ts` — точка входа

- Глобальный `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- **В отличие от `AuthService`, этот сервис — не только HTTP-сервер, но и микросервис-консьюмер:** `app.connectMicroservice({ transport: Transport.RMQ, options: { urls: [RABBITMQ_URL], queue: 'user_events', queueOptions: { durable: true } } })`, затем `app.startAllMicroservices()`.
- Слушает ту же очередь `user_events`, в которую `AuthService` публикует `user.registered` — таким образом `UserService` получает событие о регистрации асинхронно.
- HTTP-порт — `PORT`, по умолчанию `3001`.

**Важно:** событие `avatar.updated` (обрабатываемое `ProfileEventsController`) публикуется `MediaService` в очередь **`user_events`** (см. документацию `MediaService`, `MediaModule` регистрирует клиент `USER_EVENTS_SERVICE` на очередь `user_events`) — то есть `UserService` слушает единственную очередь `user_events`, из которой разбирает оба типа событий (`user.registered` и `avatar.updated`) по паттерну (`@EventPattern`).

## 3. `app.module.ts`

Импортирует `ConfigModule` (global), `PrismaModule`, `ProfileModule`, `AuthModule`, `RedisModule`. Собственных guard'ов на уровне приложения не регистрирует (в отличие от `AuthService`, здесь нет глобального `ThrottlerGuard`).

## 4. `auth/` — валидация JWT (без выпуска токенов)

- `JwtStrategy` — идентична стратегии в `AuthService`/`ChatService` и т.д.: тот же секрет `JWT_SECRET`, тот же payload `{ userId: sub, email }`. Токены, выпущенные `AuthService`, валидны здесь без дополнительной синхронизации, так как секрет общий (задаётся одинаковой переменной окружения для всех сервисов).
- `JwtAuthGuard` — обёртка `AuthGuard('jwt')`.
- `AuthModule` этого сервиса регистрирует только `JwtStrategy` — здесь нет ни `JwtModule.registerAsync` (выпуска токенов), ни OAuth-стратегий: сервис умеет только **проверять** переданный токен.

## 5. `prisma/`, `redis/`

Идентичны по структуре и коду соответствующим модулям `AuthService` (тот же `PrismaPg`-адаптер, тот же `RedisService` на базе `ioredis`).

## 6. `profile/dto/update-profile.dto.ts`

```ts
class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(32) username?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(160) bio?: string;
}
```

- Все поля опциональны — `PATCH` поддерживает частичное обновление.
- `avatarUrl` не проверяется как `@IsUrl()` — просто произвольная строка. Клиент теоретически может записать в `avatarUrl` что угодно через этот DTO, при этом реальное обновление аватара после загрузки медиафайла происходит **другим путём** — через событие `avatar.updated` (см. `profile-events.controller.ts`), минуя этот DTO. Наличие поля `avatarUrl` в `UpdateProfileDto` при этом создаёт два независимых пути изменения одного и того же значения (см. замечания).

## 7. `profile/profile.module.ts`

Импортирует `PrismaModule`, `RedisModule`. Providers: `ProfileService`. Controllers: **оба** — `ProfileController` (REST + `user.registered`) и `ProfileEventsController` (`avatar.updated`).

## 8. `profile/profile.controller.ts` — REST + событие регистрации

| Метод | Тип | Роут/событие | Guard |
|---|---|---|---|
| `getMe` | HTTP GET | `/users/me` | `JwtAuthGuard` |
| `handleUserRegistered` | Event | `user.registered` | — |
| `updateMe` | HTTP PATCH | `/users/me` | `JwtAuthGuard` |

Логика не изменилась относительно ранее задокументированной версии: `getMe`/`updateMe` делегируют в `ProfileService`, `handleUserRegistered` вызывает `createProfile`.

## 9. `profile/profile-events.controller.ts` — событие обновления аватара (новый файл)

```ts
@Controller()
export class ProfileEventsController {
  @EventPattern('avatar.updated')
  async handleAvatarUpdated(@Payload() data: { userId: string; avatarUrl: string }) {
    await this.profileService.updateAvatarUrl(data.userId, data.avatarUrl);
  }
}
```

- Отдельный контроллер, вынесенный специально под события, не связанные напрямую с REST-путём `/users`.
- Подписан на `avatar.updated`, публикуемое `MediaService.saveVariants()` после того, как `ImageProxyService` обработал загруженное изображение (обрезал/сгенерировал вариант `avatar`).

## 10. `profile/profile.service.ts` — бизнес-логика

### 10.1. `createProfile(data)`
Идемпотентно: если профиль для `userId` уже есть — пропускает с предупреждением в лог; иначе создаёт `{ userId, email, username }`.

### 10.2. `getProfile(userId)`
Cache-aside чтение: ключ `` `profile:$${userId}` `` (обратите внимание на лишний литеральный `$` — см. раздел 12), TTL кеша 300 сек, `NotFoundException`, если профиля нет ни в кеше, ни в БД.

### 10.3. `updateProfile(userId, dto)`
Проверка существования профиля → `NotFoundException`, иначе — `prisma.profile.update` с данными `dto` целиком (включая, теоретически, `avatarUrl`, если клиент передал его через `PATCH /users/me` — см. замечания) → удаление кеша по ключу `` `prodile:${userId}` `` (опечатка `prodile`, см. раздел 12).

### 10.4. `updateAvatarUrl(userId, avatarUrl)` — новый метод
```ts
async updateAvatarUrl(userId: string, avatarUrl: string) {
  await this.prismaService.profile.update({ where: { userId }, data: { avatarUrl } });
  await this.redisService.client.del(`profile:${userId}`);
}
```
- Вызывается только из `ProfileEventsController.handleAvatarUpdated`, то есть только в ответ на событие `avatar.updated` из `MediaService`.
- **Ключ инвалидации кеша здесь сформирован правильно** (`` `profile:${userId}` ``, без лишнего `$`), но он всё равно **не совпадает** с реальным ключом, который использует `getProfile` (`` `profile:$${userId}` ``) — см. раздел 12.

---

## 11. Модель данных (реконструкция)

**`Profile`**
| Поле | Комментарий |
|---|---|
| `userId` | PK / unique, совпадает с `User.id` из `AuthService` |
| `email` | копия email на момент регистрации (денормализация между сервисами) |
| `username` | то же |
| `avatarUrl` | ссылка на файл аватара, обновляется двумя путями (см. замечания) |
| `bio` | текстовое описание, до 160 символов |

---

## 12. Используемые ключи Redis и найденная проблема с кешем

| Метод | Ключ, который реально используется в коде |
|---|---|
| `getProfile` (чтение и запись кеша) | `` `profile:$${userId}` `` — содержит **литеральный** символ `$` перед подставленным `userId` |
| `updateProfile` (инвалидация) | `` `prodile:${userId}` `` — опечатка: `prodile` вместо `profile`, и без лишнего `$` |
| `updateAvatarUrl` (инвалидация) | `` `profile:${userId}` `` — написан «правильно» (без опечатки и без лишнего `$`), но именно поэтому тоже **не совпадает** с ключом из `getProfile` |

**Итог: три метода используют три разных строки ключа**, ни одна инвалидация не попадает в реальный кеш, записанный `getProfile`. Практическое следствие:

- После `PATCH /users/me` (`updateProfile`) — устаревшие данные профиля могут отдаваться из кеша до 5 минут (TTL).
- После получения события `avatar.updated` (`updateAvatarUrl`) — то же самое: обновлённый `avatarUrl` не долетит до `GET /users/me`, пока кеш `profile:$${userId}` не истечёт сам, до 5 минут.

Исправление: вынести формирование ключа в один приватный метод (например, `private cacheKey(userId: string) { return \`profile:${userId}\`; }`) и использовать его во всех трёх местах.

---

## 13. Взаимодействие с другими сервисами (RabbitMQ)

| Событие | Очередь | Источник | Обработчик здесь |
|---|---|---|---|
| `user.registered` | `user_events` | `AuthService` | `ProfileController.handleUserRegistered` → `createProfile` |
| `avatar.updated` | `user_events` | `MediaService` (после обработки аватара `ImageProxyService`-ом) | `ProfileEventsController.handleAvatarUpdated` → `updateAvatarUrl` |

`UserService` сам ничего не публикует — чистый подписчик обеих очередей событий, относящихся к пользователю.

---

## 14. Сводные замечания

1. **Баг с несовпадающими ключами кеша** (см. раздел 12) — приоритетная проблема, кеш профиля фактически никогда не инвалидируется корректно.
2. **Двойной путь изменения `avatarUrl`.** Поле `avatarUrl` присутствует и в `UpdateProfileDto` (клиент может передать его напрямую через `PATCH /users/me`), и обновляется отдельно через событие `avatar.updated` из `MediaService`. Если клиент отправит в `PATCH /users/me` собственное значение `avatarUrl`, оно перезапишет корректно сгенерированный URL из `MediaService`/`ImageProxyService` (например, ссылкой на несуществующий или произвольный файл), так как `avatarUrl` в `UpdateProfileDto` не проверяется на принадлежность реальному, подтверждённому медиафайлу пользователя. Стоит либо убрать `avatarUrl` из `UpdateProfileDto` (раз он должен управляться только через флоу загрузки аватара), либо валидировать его так же строго, как `MediaService` валидирует `mediaId` через `verifyMedia`.
3. **`avatarUrl` не валидируется как URL** (`@IsString()`, а не `@IsUrl()`) — минорная недоработка валидации.
4. **Разные тексты `NotFoundException`** («Профиль не найден» в `getProfile` vs `'Profile not found'` в `updateProfile`) — не унифицировано, как и в остальных сервисах системы.
5. Сервис не имеет собственного глобального rate-limiting (`ThrottlerGuard`), в отличие от `AuthService` — `PATCH /users/me` не защищён от частых повторных вызовов на уровне этого сервиса.
