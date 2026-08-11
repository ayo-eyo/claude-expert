# Ресерч: техническая реализация загрузки записи встречи

**План**: `docs/plan-meeting-recording-upload-storage-and-ui.md`
**PRD**: `docs/prd-meeting-recording-upload-storage-and-ui.md`
**Дата**: 2026-08-11

Всё, что помечено ✅ **проверено**, подтверждено чтением исходников в `node_modules` этого репозитория или запуском эксперимента (скрипты в приложении). Всё остальное — рекомендация или дизайн-решение.

---

## 0. Резюме решений

| Вопрос                                                | Решение                                                                | Почему                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Приём multipart                                       | `FileInterceptor` из `@nestjs/platform-express` + `multer.diskStorage` | multer 2.2.0 уже установлен как зависимость `@nestjs/platform-express` ✅                                   |
| Память                                                | **только `diskStorage`**, не `memoryStorage`                           | запись на сотни МБ в `Buffer` убьёт heap Node                                                               |
| Конфиг multer                                         | `MulterModule.registerAsync({ useFactory })`                           | опции `FileInterceptor('file', {...})` вычисляются на этапе загрузки модуля, `ConfigService` там недоступен |
| Валидация MIME                                        | `fileFilter` в опциях multer, **не** `ParseFilePipe`                   | `FileTypeValidator` при diskStorage всегда возвращает `false` ✅ (см. §2.7)                                 |
| Лимит размера                                         | `limits.fileSize`                                                      | Nest сам маппит ошибку multer в `413 Payload Too Large` ✅                                                  |
| Очистка частичных файлов                              | делает сам multer 2.x                                                  | ✅ проверено экспериментом для превышения лимита, отказа `fileFilter` и обрыва соединения клиентом          |
| Очистка при ошибках **после** загрузки (409, сбой БД) | вручную, `try/catch` в сервисе                                         | multer к этому моменту уже отдал управление хендлеру                                                        |
| Кодировка имён файлов                                 | `defParamCharset: 'utf8'` **обязательно**                              | по умолчанию `latin1`, кириллические имена превращаются в мусор ✅                                          |
| Типы                                                  | нужен `npm i -D @types/multer -w backend`                              | `Express.Multer.File` сейчас не резолвится, `tsc` падает с TS2694 ✅                                        |
| Проверка владельца                                    | отдельный `MeetingOwnerGuard` перед `FileInterceptor`                  | guard-ы в Nest выполняются раньше интерсепторов → 404 до записи байтов на диск                              |
| Отдача файла                                          | `StreamableFile` + `fs.createReadStream`                               | без буферизации всего файла в памяти                                                                        |
| Прогресс загрузки на фронте                           | `XMLHttpRequest`                                                       | `fetch` не даёт событий прогресса **отправки**                                                              |
| Drag-and-drop                                         | нативные DOM-события                                                   | HeroUI v3 не экспортирует `FileTrigger`/`DropZone` ✅                                                       |

---

## 1. Проверенный контекст репозитория

| Пакет                      | Версия                                                                                              | Примечание                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `@nestjs/platform-express` | 11.x                                                                                                | зависит от `express@5.2.1`, `multer@2.2.0` ✅                        |
| `multer`                   | 2.2.0                                                                                               | без собственных типов (`package.json` не содержит `types`) ✅        |
| `@types/multer`            | **не установлен** ✅                                                                                | нужно добавить                                                       |
| `file-type`                | 21.3.4 (ESM)                                                                                        | подтянут `@nestjs/common`; используется только `FileTypeValidator`   |
| Prisma                     | 7.9.1, генератор `prisma-client` в `src/generated/prisma`, конфиг в `apps/backend/prisma.config.ts` | датасорс без `url`, URL приходит из `prisma.config.ts`               |
| Next.js                    | 16.3.0                                                                                              | `params` в page — Promise                                            |
| `@heroui/react`            | 3.2.4                                                                                               | есть `ProgressBar`, `Chip`, `Card`, `Alert`, `Spinner`, `EmptyState` |

Полезная деталь: в `apps/backend/package.json` скрипт `test:e2e` уже запускается с `NODE_OPTIONS=--experimental-vm-modules` — это ровно то, что требует `file-type` для динамического ESM-импорта внутри Jest. Если валидацию по magic numbers всё-таки будете включать, инфраструктура к этому готова.

---

## 2. Приём multipart на бэкенде

### 2.1 Порядок выполнения — ключ ко всей фазе 1

Жизненный цикл запроса в Nest: **middleware → guards → interceptors → pipes → handler**.

Практическое следствие: `JwtAuthGuard` отрабатывает **до** того, как multer прочитает хоть один байт тела. Значит 401 без JWT не приводит к записи файла на диск — бесплатно, без дополнительного кода.

А вот проверка владельца встречи (`findOneForOwner`) по умолчанию оказалась бы **в хендлере**, то есть уже после того, как multer записал файл. Чужой встрече соответствует 404, но файл при этом успел лечь на диск. Два варианта:

**Вариант A (рекомендуемый): вынести проверку в guard.**

```ts
// apps/backend/src/recordings/guards/meeting-owner.guard.ts
@Injectable()
export class MeetingOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const meetingId = request.params.id;

    const meeting = await this.prisma.client.meeting.findFirst({
      where: { id: meetingId, ownerId: request.user.id },
      select: { id: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
```

`PrismaModule` помечен `@Global()`, так что guard получает `PrismaService` без дополнительных импортов.

Плюс: для чужой встречи на диск не попадает ни байта.
Минус, о котором надо знать: если ответ 404 уходит, пока клиент ещё заливает 200 МБ, Node закрывает сокет не дочитав тело — браузер увидит `network error` вместо кода 404. Для e2e через supertest с маленькими файлами это незаметно, для реальной большой загрузки — да. Поэтому фронтенд должен трактовать обрыв во время аплоада как ошибку загрузки, а не как «успех».

**Вариант B: оставить проверку в хендлере** и удалять файл в `catch`. Проще, HTTP-семантика чище (клиент гарантированно получает 404/409), но чужой/конфликтующий запрос всё равно пишет полный файл на диск перед удалением.

Рекомендация: A для проверки владельца + ручная очистка в сервисе как страховочная сетка (она всё равно нужна для 409 и сбоев БД, см. §2.5).

### 2.2 Конфигурация multer через ConfigService

`FileInterceptor('file', { ... })` — декоратор, его аргументы вычисляются при загрузке модуля, до создания DI-контейнера. Читать env через `ConfigService` там негде. Правильный путь — глобальная регистрация опций модулем:

```ts
// apps/backend/src/recordings/recordings.module.ts
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: config.getOrThrow<string>('RECORDINGS_STORAGE_ROOT'),
          filename: (_req, file, cb) => cb(null, `${randomUUID()}${extensionFor(file.mimetype)}`),
        }),
        limits: {
          fileSize: config.get<number>('RECORDINGS_MAX_BYTES') ?? 200 * 1024 * 1024,
          files: 1,
        },
        defParamCharset: 'utf8',
        fileFilter: recordingFileFilter,
      }),
    }),
  ],
  controllers: [RecordingsController],
  providers: [RecordingsService, RecordingsStorageService, MeetingOwnerGuard],
})
export class RecordingsModule {}
```

В контроллере тогда `@UseInterceptors(FileInterceptor('file'))` — без локальных опций, они подтянутся из модуля.

Приятная мелочь ✅: если `destination` — строка, multer в конструкторе `DiskStorage` делает `fs.mkdirSync(destination, { recursive: true })` (`node_modules/multer/storage/disk.js`). Каталог хранения создастся сам при старте приложения, отдельный bootstrap-код не нужен.

`limits.files: 1` стоит выставить явно — второй файл в том же запросе даст `LIMIT_FILE_COUNT` → 400, а не тихо проигнорируется.

### 2.3 Валидация MIME через fileFilter

```ts
const ALLOWED_MIME = new Set(['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm']);

export const recordingFileFilter: MulterOptions['fileFilter'] = (_req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
    return;
  }
  cb(null, true);
};
```

Почему именно так, а не `cb(null, false)`: при `false` без ошибки multer просто пропускает файл, запрос доходит до хендлера с `file === undefined`, и 400 придётся собирать вручную. С исключением всё аккуратнее — `transformException` в Nest пропускает `HttpException` наружу без изменений ✅ (`node_modules/@nestjs/platform-express/multer/multer/multer.utils.js`, первая же строка: `if (!error || error instanceof HttpException) return error`), клиент получает ровно 400 с вашим сообщением.

Важно: `file.mimetype` — это то, что прислал браузер в заголовке части, значение подделывается тривиально. Для целей PRD (белый список типов, не безопасность) этого достаточно; вирус-сканирование и проверка сигнатур явно вне скоупа. Если позже понадобится честная проверка — читать magic numbers придётся уже после записи на диск, из файла (см. §2.7).

На всякий случай оставьте в хендлере guard-клаузу:

```ts
if (!file) throw new BadRequestException('File is required');
```

Она закрывает случай, когда поле `file` вообще не пришло в форме.

### 2.4 Лимит размера и 413

`limits.fileSize` → multer бросает `MulterError('LIMIT_FILE_SIZE')` с сообщением `'File too large'`. Nest маппит это в `PayloadTooLargeException` (413) ✅ — сверил константу `multerExceptions.LIMIT_FILE_SIZE = 'File too large'` в `multer.constants.js` с `errorMessages` в `multer/lib/multer-error.js`, строки совпадают, `switch` по `error.message` срабатывает.

То есть 413 из критерия приёмки PRD получается **автоматически**, писать свой фильтр исключений не нужно.

Отдельно: `express.json()`-лимиты к multipart отношения не имеют, `app.useBodyParser`/`bodyLimit` трогать не надо. Единственный лимит — `limits.fileSize`.

### 2.5 Очистка файлов: что multer делает сам, а что нет

Читал `node_modules/multer/lib/make-middleware.js`: в `abortWithError` собирается список `uploadedFiles.concat(pendingFiles.filter(f => f.path))` и каждый удаляется через `storage._removeFile` (`fs.unlink`). Ключевое отличие multer 2.x: `file.path` проставляется в `_handleFile` **до** окончания записи потока, поэтому недописанный файл тоже попадает в список на удаление.

Проверил экспериментально (скрипт в приложении A) ✅:

| Сценарий                                                      | Результат на диске                       |
| ------------------------------------------------------------- | ---------------------------------------- |
| Файл 10 МБ при лимите 1 КБ (`LIMIT_FILE_SIZE`)                | пусто                                    |
| Отказ `fileFilter`                                            | пусто                                    |
| Клиент оборвал загрузку 200 МБ на ~120 мс (`AbortController`) | пусто, хендлер получил `Request aborted` |

Значит три сценария PRD — превышение лимита, неверный MIME, отмена загрузки — закрываются самим multer, дополнительного кода не требуют. Это стоит закрепить e2e-тестом, но не изобретать под них механизм.

**Что multer НЕ чистит** — всё, что произошло после того, как он успешно отдал управление хендлеру:

- конфликт 409 (запись для встречи уже есть);
- падение `prisma.create` (потеря соединения с БД, нарушение constraint);
- любое исключение в сервисе.

Здесь файл остаётся на диске навсегда, если его не удалить руками:

```ts
async create(ownerId: string, meetingId: string, file: Express.Multer.File): Promise<MeetingRecordingResponse> {
  try {
    const recording = await this.prisma.client.meetingRecording.create({
      data: {
        meetingId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.filename, // только имя, не абсолютный путь — см. §3
        status: 'uploaded',
      },
    });
    return toResponse(recording);
  } catch (error) {
    await this.storage.remove(file.filename); // best-effort, ошибки только логируем
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Recording already exists for this meeting');
    }
    throw error;
  }
}
```

`Prisma` импортируется как `import { Prisma } from '../generated/prisma/client'` ✅ (`client.ts` экспортирует namespace `Prisma`, внутри которого есть `PrismaClientKnownRequestError`).

Про 409: полагаться только на предварительный `findUnique` нельзя — две параллельные загрузки на одну встречу проскочат проверку обе. Уникальный индекс на `meetingId` + обработка `P2002` — единственный надёжный вариант. Предварительная проверка в guard полезна как оптимизация (не льём байты зря), но не как гарантия.

### 2.6 Типы: нужен @types/multer

`Express.Multer.File` сейчас не существует. Проверил ✅ — временно положил в `src` контроллер с `@UploadedFile() file: Express.Multer.File` и запустил `npm run typecheck -w backend`:

```
src/__mtest.ts(8,36): error TS2694: Namespace 'global.Express' has no exported member 'Multer'.
```

multer 2.2.0 своих типов не поставляет (в `package.json` нет `types`/`typings`, в тарболе только `index.js`, `lib/`, `storage/`) ✅. Значит первым делом в фазе 1:

```bash
npm i -D @types/multer -w backend
```

Без этого не соберётся ни контроллер, ни `fileFilter`, ни e2e-тест — а `typecheck` входит в pre-commit хук репозитория.

### 2.7 Почему ParseFilePipe + FileTypeValidator здесь не подходят

Инстинктивно хочется написать канонический Nest-код:

```ts
@UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize }), new FileTypeValidator({ fileType: /^(video|audio)\// })] }))
```

С `diskStorage` это сломается. Разобрал `node_modules/@nestjs/common/pipes/file/file-type.validator.js` ✅: `FileTypeValidator` в Nest 11 проверяет **magic numbers**, читая `file.buffer` через `file-type`. При `diskStorage` `file.buffer` не заполняется — есть только `path`. В коде это ветка:

```js
if (!file.buffer) {
  if (this.validationOptions.fallbackToMimetype) {
    return !!file.mimetype.match(this.validationOptions.fileType);
  }
  return false; // ← всегда невалидно
}
```

То есть при диске валидатор отклонит **любой** файл, если не передать `skipMagicNumbersValidation: true` или `fallbackToMimetype: true`. А обе эти опции вырождают его в обычное сравнение строки `mimetype` — ровно то, что уже делает `fileFilter`, только на два шага позже (файл уже на диске, и удалять его придётся самим).

`MaxFileSizeValidator` в pipe тоже хуже, чем `limits.fileSize`: pipe отработает только после того, как весь файл будет принят и записан, и вернёт 400 вместо 413. `limits.fileSize` обрывает поток на превышении и даёт корректный 413 ✅.

**Вывод**: вся валидация — в опциях multer (`fileFilter` + `limits`), `ParseFilePipe` в этой фиче не используем. Если когда-нибудь понадобится проверка сигнатур — её место в сервисе после загрузки, через `fileTypeFromFile(path)` из `file-type` (пакет уже в дереве, ESM — потребуется динамический `import()`), с удалением файла при несовпадении.

---

## 3. Модуль хранения файлов

PRD требует, чтобы миграция на объектное хранилище сводилась к замене одного слоя. Поэтому весь доступ к ФС — в одном сервисе с узким интерфейсом:

```ts
@Injectable()
export class RecordingsStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.getOrThrow<string>('RECORDINGS_STORAGE_ROOT'));
  }

  resolve(storagePath: string): string {
    const absolute = path.resolve(this.root, storagePath);
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new Error(`Refusing to access path outside of storage root: ${storagePath}`);
    }
    return absolute;
  }

  createReadStream(storagePath: string): Readable {
    return createReadStream(this.resolve(storagePath));
  }

  async remove(storagePath: string): Promise<void> {
    await rm(this.resolve(storagePath), { force: true });
  }
}
```

Решения и обоснования:

- **В БД хранить относительный путь**, а не абсолютный. Абсолютный путь ломается при смене `RECORDINGS_STORAGE_ROOT`, переезде на другую машину или в контейнер; относительный переживает всё это. `storagePath` = имя файла, сгенерированное multer.
- **Имя генерирует сервер**: `randomUUID()` + расширение, выведенное из белого списка MIME (`video/mp4 → .mp4`, `audio/mpeg → .mp3` и т.д.), а не из `file.originalname`. `originalname` полностью подконтролен клиенту (`../../etc/passwd`, нулевые байты, 300 символов юникода) и хранится только как метаданные для `Content-Disposition`. Расширение — из своей мапы, не через `path.extname(originalname)`.
- **Проверка `resolve` на выход за корень** нужна даже при генерируемых именах: она защищает от порчи данных в БД и от будущих правок, где путь начнёт приходить извне. Дешёвая страховка.
- **`rm(..., { force: true })`** вместо `unlink` — не бросает `ENOENT`, если файла уже нет; для идемпотентного удаления это то, что нужно.
- **Плоская структура** каталога достаточна для итерации. Шардинг по первым символам UUID (`ab/cd/abcd-....mp4`) пригодится, когда файлов станут десятки тысяч, — но это преждевременно и усложняет очистку.
- **Каталог должен лежать вне `apps/backend/src`** и вне любой статики, и попасть в `.gitignore`. По умолчанию, например, `RECORDINGS_STORAGE_ROOT=./var/recordings` относительно корня backend; в `.gitignore` уже есть общие правила, но `var/` придётся добавить.
- **Никакого `ServeStaticModule`** на этот каталог — PRD прямо требует отдачу только через авторизованный эндпоинт.

Про перемещение файлов: соблазнительно писать сначала во временный каталог, потом `rename` в постоянный. Не стоит — `fs.rename` между разными файловыми системами даёт `EXDEV` и требует fallback на копирование (лишний проход по сотням мегабайт). multer пишет сразу в целевой каталог, промежуточная стадия не нужна.

---

## 4. Схема данных и миграция

```prisma
model MeetingRecording {
  id           String   @id @default(uuid())
  meetingId    String   @unique
  meeting      Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  originalName String
  mimeType     String
  sizeBytes    Int
  storagePath  String
  status       RecordingStatus @default(uploaded)
  uploadedAt   DateTime @default(now())
}

enum RecordingStatus {
  uploaded
  processing
  ready
  failed
}
```

И обратная сторона связи в `Meeting`:

```prisma
model Meeting {
  // ...
  recording MeetingRecording?
}
```

Заметки:

- `@unique` на `meetingId` даёт и связь 1:1, и защиту от гонки при повторной загрузке (§2.5).
- `onDelete: Cascade` — как требует PRD. Существующая миграция `20260809082657_add_meeting` уже использует `ON DELETE CASCADE` для связи участников, стиль совпадает.
- **Каскад в БД удалит строку, но не файл на диске.** Удаления встреч в скоупе нет, так что сейчас это безвредно, но об этом стоит написать комментарий в схеме, чтобы будущий `DELETE /meetings/:id` не оставил сирот. Правильное место для решения — сервис удаления встречи (сначала прочитать `storagePath`, потом удалить встречу, потом файл).
- `sizeBytes` типа `Int` держит до ~2.1 ГБ. Для лимита в сотни МБ достаточно; если лимит когда-нибудь поднимут выше 2 ГБ — `BigInt` и сериализация в строку. Сейчас `Int` проще (JSON-сериализация `BigInt` требует ручного `toString`).
- Enum статуса в БД против строкового поля: enum даёт валидацию на уровне БД, но каждый новый статус — это миграция. Для четырёх фиксированных значений из PRD enum уместнее.
- Миграция: `npx prisma migrate dev --name add_meeting_recording -w backend`, клиент регенерируется автоматически в `src/generated/prisma`. Конфиг датасорса берётся из `apps/backend/prisma.config.ts` (там `dotenv/config` + `process.env.DATABASE_URL`), так что нужен поднятый Postgres из `docker-compose.yml`.

---

## 5. Отдача файла (download)

```ts
@Get(':id/recording/download')
async download(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') id: string,
): Promise<StreamableFile> {
  const recording = await this.recordingsService.findOneForOwner(user.id, id);
  const stream = this.storage.createReadStream(recording.storagePath);

  return new StreamableFile(stream, {
    type: recording.mimeType,
    disposition: contentDisposition(recording.originalName),
    length: recording.sizeBytes,
  });
}
```

`StreamableFile` из `@nestjs/common` принимает `Readable` и опции `{ type, disposition, length }` ✅ (сверил `file-stream/interfaces/streamable-options.interface.d.ts`). Это лучше, чем `res.download()` через `@Res()`: не выключается механика Nest вокруг ответа и не нужен `passthrough`.

**Content-Disposition и не-ASCII имена.** `Content-Disposition: attachment; filename="запись.mp4"` — невалидный HTTP-заголовок, значения полей должны быть ASCII. Нужен формат RFC 5987/6266 с двумя параметрами:

```ts
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
```

Современные браузеры возьмут `filename*`, старые — ASCII-фолбэк. Экранирование кавычек и обратных слэшей обязательно: имя файла контролируется пользователем, без экранирования оно позволяет вписать в заголовок что угодно.

**Здесь же вылезает связка с загрузкой.** Если не выставить `defParamCharset: 'utf8'` в опциях multer, до `Content-Disposition` дело даже не дойдёт: имя испортится ещё на приёме. Проверил ✅ — при дефолтном `latin1` имя `запись.mp4` сохраняется как `Ð·Ð°Ð¿Ð¸ÑÑ.mp4`, при `defParamCharset: 'utf8'` — корректно.

**CORS.** `app.enableCors()` в `configure-app.ts` вызывается без опций, а значит `Content-Disposition` браузер клиентскому JS не отдаст (в CORS-ответе читаемы только safelisted-заголовки). Два пути:

1. Не читать заголовок вообще — имя файла фронтенд и так знает из метаданных записи (`recording.originalName`). **Рекомендуемый вариант**: меньше связности, работает без правки CORS.
2. Если всё же понадобится: `app.enableCors({ exposedHeaders: ['Content-Disposition'] })`.

**Range-запросы** (перемотка при стриминге) `StreamableFile` не реализует. В скоупе только скачивание, плеера нет — это нормально. Появится плеер — понадобится ручная обработка `Range`/`206`.

**Ошибка чтения файла.** Если строка в БД есть, а файла нет, `createReadStream` бросит `ENOENT` асинхронно, уже после того как начали писать ответ. У `StreamableFile` для этого есть `setErrorHandler` — стоит залогировать и вернуть 404, иначе клиент получит оборванное соединение без объяснений.

---

## 6. Удаление записи

Порядок операций фиксируется требованием PRD «исключить мёртвые ссылки в БД»:

1. Найти запись с проверкой владельца (404, если нет).
2. **Удалить строку в БД.**
3. Удалить файл (`rm({ force: true })`), ошибку только залогировать.
4. Вернуть 204 (`@HttpCode(HttpStatus.NO_CONTENT)`).

Именно такой порядок, а не обратный. ФС и БД не транзакционны, поэтому выбираем, каким рассогласованием готовы платить:

- Сначала БД: при падении на шаге 3 остаётся файл-сирота — занимает место, но система консистентна, пользователь видит пустой блок записи и может загрузить новую.
- Сначала файл: при падении на шаге БД остаётся строка, указывающая на несуществующий файл — UI покажет запись, скачивание сломается, повторная загрузка упрётся в 409. Явно хуже.

Сирот при желании подчистит будущий скрипт сверки каталога с таблицей; отдельная задача, вне скоупа.

---

## 7. Поле recording в ответах по встречам

Правки в `MeetingsService` минимальные и локальные:

```ts
const MEETING_INCLUDE = { participants: true, recording: true } as const;

type MeetingWithRelations = MeetingModel & {
  participants: UserModel[];
  recording: MeetingRecordingModel | null;
};
```

и в `toResponse` — `recording: meeting.recording ? toRecordingResponse(meeting.recording) : null`.

`MEETING_INCLUDE` уже вынесен в константу и используется во всех трёх методах ✅ — значит одна правка автоматически покрывает и `GET /meetings`, и `GET /meetings/:id`, и ответ `POST /meetings` (там `recording` всегда `null`).

Важно: `storagePath` **не должен** попадать в `MeetingRecordingResponse`. Наружу — `id`, `originalName`, `mimeType`, `sizeBytes`, `status`, `uploadedAt`. Внутренняя раскладка ФС клиенту не нужна и является лишней информацией для атакующего. Функция `toRecordingResponse` — общая для `MeetingsService` и `RecordingsService`, положить её рядом с интерфейсом ответа.

Циклическая зависимость модулей: `RecordingsService` нужен доступ к встречам, `MeetingsService` — к записям. Чтобы не тянуть `forwardRef`, проще держать всю логику записей в `RecordingsModule` с прямым обращением к `PrismaService` (он глобальный), а в `MeetingsService` просто добавить `recording: true` в include. Никакого взаимного импорта сервисов не возникает.

---

## 8. e2e-тесты

Существующий `test/meetings.e2e-spec.ts` даёт готовый скелет: реальный `AppModule`, реальная БД, регистрация пользователей через API, чистка в `afterAll`. Для записей добавляется три вещи.

**Отправка файла** — supertest умеет multipart из буфера:

```ts
await request(app.getHttpServer())
  .post(`/meetings/${meeting.id}/recording`)
  .set('Authorization', `Bearer ${owner.token}`)
  .attach('file', Buffer.from('fake mp4 bytes'), {
    filename: 'standup.mp4',
    contentType: 'video/mp4',
  })
  .expect(201);
```

Третий аргумент с `contentType` обязателен: без него supertest выведет тип из расширения и `fileFilter` может получить не то, что вы проверяете.

**Изолированный каталог хранения.** Тесты не должны писать в рабочий каталог. `RECORDINGS_STORAGE_ROOT` читается через `ConfigService` при создании модуля, поэтому достаточно выставить env до `Test.createTestingModule`:

```ts
const storageRoot = mkdtempSync(path.join(os.tmpdir(), 'recordings-e2e-'));
process.env.RECORDINGS_STORAGE_ROOT = storageRoot;
process.env.RECORDINGS_MAX_BYTES = String(1024); // маленький лимит → быстрый тест на 413
```

и `rmSync(storageRoot, { recursive: true, force: true })` в `afterAll`. Маленький лимит в тестах принципиален: гонять реальные сотни мегабайт через supertest долго и бессмысленно, а проверяется ровно то же поведение.

Осторожно: `ConfigModule.forRoot({ isGlobal: true })` кэширует env на момент старта модуля, поэтому присвоение должно быть **до** `createTestingModule`, а не в `beforeEach`.

**Проверка диска.** Тесты по критериям PRD должны смотреть не только на HTTP-код, но и на ФС:

```ts
expect(readdirSync(storageRoot)).toHaveLength(1); // после 201
expect(readdirSync(storageRoot)).toHaveLength(0); // после 400/413/204
```

Проверка идентичности байтов при скачивании: `.responseType('blob')` в supertest даёт `res.body` как `Buffer`, дальше `expect(res.body.equals(original)).toBe(true)` и отдельно `expect(res.headers['content-disposition']).toContain('standup.mp4')`.

Чистка БД: у `MeetingRecording` каскад от `Meeting`, а существующий `afterAll` уже удаляет созданные встречи ✅ — записи уедут вместе с ними, дополнительный `deleteMany` не нужен.

---

## 9. Frontend

### 9.1 Страница `/meetings/[id]` в Next.js 16

`params` — Promise. В клиентском компоненте разворачивается через `use()` ✅ (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`):

```tsx
'use client';
import { use } from 'react';

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // ...
}
```

Вся страница будет клиентской: токен лежит в `localStorage`, серверный рендер до него не доберётся. Это ровно тот же паттерн, что уже на `src/app/page.tsx` (инициализация состояния из `getAccessToken()`, редирект на `/login`, `Spinner` до загрузки) — стоит его повторить, а не изобретать новый.

Альтернатива `useParams()` тоже работает, но `use(params)` типизируется точнее (`useParams` возвращает `string | string[] | undefined`).

### 9.2 Загрузка с прогрессом и отменой: только XHR

`fetch` не сообщает прогресс **отправки**. Стриминг тела запроса через `ReadableStream` + `duplex: 'half'` существует, но требует HTTP/2, не поддерживается частью браузеров и заметно сложнее. Для аплоада с процентами каноническое решение — `XMLHttpRequest`, у которого есть `xhr.upload.onprogress`.

```ts
export function uploadRecording(
  token: string,
  meetingId: string,
  file: File,
  { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<MeetingRecordingResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file); // имя поля обязано совпадать с FileInterceptor('file')

    xhr.open('POST', `${API_BASE_URL}/meetings/${meetingId}/recording`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Content-Type не выставляем вручную — иначе потеряется boundary

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as MeetingRecordingResponse);
      } else {
        reject(parseXhrError(xhr)); // тот же формат ошибок Nest, что в toApiError
      }
    };
    xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
```

Тонкости, каждая из которых стоит отдельного бага:

- **Не устанавливать `Content-Type` вручную.** Браузер сам добавит `multipart/form-data; boundary=...`. Ручной заголовок без boundary → busboy отвечает `Boundary not found` → 400.
- **Отмена**: `xhr.abort()`. На сервере при этом всё чисто — проверено, партиал удаляется (§2.5). В UI важно отличать `AbortError` от настоящей ошибки и не показывать алерт при намеренной отмене.
- **`AbortSignal`** вместо возврата самого `xhr` наружу: интерфейс совпадает с `fetch` и переносится на будущее.
- **Ошибка парсинга.** Nest на 413 отдаёт JSON `{ statusCode, message }`, но при разрыве соединения `responseText` может быть пустым — `JSON.parse` обязан быть в `try/catch`.
- Прогресс доходит до 100% в момент отправки последнего байта, а не в момент ответа сервера. Между «100%» и `onload` может пройти заметное время (сервер дописывает файл, пишет в БД) — в UI это состояние честнее подписать «Обработка…», иначе полоса зависает на 100%.

### 9.3 Клиентская валидация до отправки

Критерий PRD: неверный тип/размер — ошибка **без сетевого запроса**. Значит проверка в обработчике выбора файла:

```ts
const ALLOWED = ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm'];
const MAX_BYTES = 200 * 1024 * 1024;

if (!ALLOWED.includes(file.type)) return setError('Unsupported file type.');
if (file.size > MAX_BYTES) return setError('File is too large (max 200 MB).');
```

`file.type` в браузере выводится из расширения и может быть пустой строкой для незнакомых файлов — пустую строку тоже трактуем как неподдерживаемый тип. Клиентская валидация — это UX, не защита: серверная (§2.3, §2.4) остаётся обязательной.

Лимит должен приходить из одного места. Проще всего — `NEXT_PUBLIC_RECORDINGS_MAX_BYTES` рядом с серверным `RECORDINGS_MAX_BYTES`, с одинаковым значением по умолчанию в коде. Расхождение даст худший из сценариев: клиент разрешает, сервер режет на 413 после полной заливки.

### 9.4 Drag-and-drop

HeroUI v3 `FileTrigger` и `DropZone` не экспортирует — проверил рекурсивным поиском по `node_modules/@heroui/react/dist` ✅, совпадений нет (при том что `ProgressBar`, `EmptyState`, `Chip` на месте). Под капотом библиотеки лежит `react-aria-components`, где эти компоненты есть, но он не заявлен в зависимостях `apps/frontend`, и импорт из него работал бы только благодаря hoisting в npm workspaces — хрупко.

Поэтому DnD пишется руками, это ~20 строк:

```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
>
```

`preventDefault` в `onDragOver` обязателен — без него `drop` не сработает вообще. Плюс скрытый `<input type="file" accept="video/mp4,video/webm,audio/mpeg,audio/wav,audio/webm">`, открываемый кнопкой через `ref.current.click()`, — иначе фича недоступна с клавиатуры. Зона дропа не должна быть единственным способом загрузки (доступность).

### 9.5 Прогресс-бар на HeroUI v3

Компонент композитный (проверил `.d.ts` ✅): `ProgressBar` + `ProgressBar.Track` + `ProgressBar.Fill` + `ProgressBar.Output`, корень — обёртка над `ProgressBar` из `react-aria-components`, принимает `value` (0–100) и `color`/`size`. Значение `aria-valuenow` и озвучка скринридером берутся на себя React Aria, руками ARIA-атрибуты не проставляем.

### 9.6 Скачивание с заголовком Authorization

Токен живёт в `localStorage`, поэтому `<a href>` не подойдёт — заголовок туда не приложить. Схема: `fetch` → `blob` → временный object URL → программный клик → освобождение URL.

```ts
export async function downloadRecording(
  token: string,
  meetingId: string,
  fileName: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/meetings/${meetingId}/recording/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await toApiError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName; // берём из recording.originalName, не из заголовка
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- **Имя файла — из метаданных записи**, а не из `Content-Disposition`: заголовок недоступен JS при текущей конфигурации CORS (§5).
- `URL.revokeObjectURL` обязателен, иначе blob висит в памяти вкладки до перезагрузки. Вызов сразу после `click()` безопасен — браузер к этому моменту уже удерживает ссылку на данные.
- **Ограничение подхода**: файл целиком материализуется в памяти вкладки. Для сотен мегабайт это ощутимо, для гигабайта — риск падения вкладки на мобильных. Пока лимит держится в пределах ~200 МБ, приемлемо. Радикальное решение (короткоживущий одноразовый токен в query-параметре и обычная ссылка, либо `showSaveFilePicker` + стриминг) — тема отдельной итерации.
- Скачивание стоит сопроводить состоянием «загружается» на кнопке: между кликом и появлением диалога сохранения проходит всё время скачивания, и без индикатора кнопка выглядит сломанной.

### 9.7 Состояние на странице

Блок записи — конечный автомат с состояниями `empty → validating → uploading(percent) → success | error`, источник истины — `recording: MeetingRecordingResponse | null` в локальном состоянии страницы. `uploadRecording` и `deleteRecording` возвращают/сбрасывают это значение, никакого `router.refresh()` не требуется (критерий PRD «без перезагрузки страницы»).

Отдельный узел — 404. Ошибку `ApiError(404)` от `getMeeting` надо отличать от прочих: 404 → экран «встреча не найдена», 401 → `clearAccessToken()` + `router.replace('/login')` (как в `src/app/page.tsx`), остальное → `Alert status="danger"`.

---

## 10. Конфигурация

| Переменная                         | Где      | Назначение                                             |
| ---------------------------------- | -------- | ------------------------------------------------------ |
| `RECORDINGS_STORAGE_ROOT`          | backend  | корневой каталог хранения, например `./var/recordings` |
| `RECORDINGS_MAX_BYTES`             | backend  | лимит `limits.fileSize`                                |
| `NEXT_PUBLIC_RECORDINGS_MAX_BYTES` | frontend | тот же лимит для клиентской валидации                  |

Добавить в `.env.example` в корне (сейчас там только `DATABASE_URL` и `JWT_SECRET`), каталог — в `.gitignore`.

Лимит согласуется в **трёх** местах: клиент (UX-проверка), `limits.fileSize` (413), и — как только перед бэкендом появится прокси — `client_max_body_size` в nginx. Если прокси зарежет раньше приложения, пользователь получит HTML-страницу ошибки от nginx вместо JSON-ответа Nest, и обработка ошибок на фронте развалится. Сейчас прокси нет, но записать это в README стоит.

Отдельно про таймауты: Node по умолчанию не ограничивает время запроса (`server.requestTimeout` в Node 18+ = 300 с), но на медленном канале 200 МБ могут не уложиться в 5 минут. Если появятся жалобы — `app.getHttpServer().requestTimeout`. Пока не трогаем, просто помним.

---

## 11. Что важно не упустить по фазам

**Фаза 1**

- `npm i -D @types/multer -w backend` — первым шагом, иначе не компилируется ничего (§2.6).
- `defParamCharset: 'utf8'` — иначе кириллические имена файлов испорчены, и это всплывёт только на фазе 4 при скачивании (§2.4, §5).
- Не тратить время на ручную очистку частичных файлов для 400/413/отмены — multer это делает сам, нужен только e2e-тест, фиксирующий поведение (§2.5).
- Ручная очистка нужна ровно для 409 и сбоев БД (§2.5).
- Не использовать `ParseFilePipe`/`FileTypeValidator` (§2.7).

**Фаза 2**

- Порядок «сначала БД, потом файл» в `DELETE` (§6).
- `storagePath` не должен утечь в API-ответ (§7).
- `filename*=UTF-8''` в `Content-Disposition` (§5).

**Фаза 3**

- `use(params)` для Promise-параметров Next 16 (§9.1).
- Разделение обработки 404 и 401 (§9.7).

**Фаза 4**

- XHR, не `fetch` — из-за прогресса (§9.2).
- Не выставлять `Content-Type` руками (§9.2).
- Имя файла при скачивании — из метаданных, не из заголовка (§9.6).
- DnD пишется руками, готового компонента в HeroUI нет (§9.4).

---

## Приложение A. Эксперименты

Проведены на этом репозитории, Node 24.11.1, multer 2.2.0. Скрипты запускались из корня репозитория (чтобы резолвился hoisted `node_modules`), после проверки удалены.

**A1. Очистка файлов и кодировка имён.** Express + multer с `diskStorage`, `limits.fileSize = 1024`, `defParamCharset: 'utf8'`, `fileFilter`, отклоняющий файлы по префиксу имени:

```
1) валидный файл, имя «запись встречи.mp4» → 200, originalname сохранён корректно, файл на диске
2) файл 10 МБ при лимите 1 КБ            → LIMIT_FILE_SIZE, на диске пусто
3) отказ fileFilter                       → ошибка фильтра, на диске пусто
```

**A2. Кодировка по умолчанию.** Тот же запрос без `defParamCharset`:

```
latin1 default → { "name": "Ð·Ð°Ð¿Ð¸ÑÑ.mp4" }
```

**A3. Обрыв загрузки клиентом.** Заливка 200 МБ, прерванная `AbortController` через 120 мс:

```
клиент: AbortError
handler получил ошибку: Request aborted
файлы на диске после abort: []
```

**A4. Отсутствие типов multer.** Временный контроллер с `@UploadedFile() file: Express.Multer.File`, `npm run typecheck -w backend`:

```
src/__mtest.ts(8,36): error TS2694: Namespace 'global.Express' has no exported member 'Multer'.
```

## Приложение B. Источники в node_modules

- `@nestjs/platform-express/multer/multer/multer.utils.js` — маппинг ошибок multer в HTTP-исключения
- `@nestjs/platform-express/multer/multer/multer.constants.js` — строки сообщений, по которым идёт маппинг
- `@nestjs/platform-express/multer/interfaces/multer-options.interface.d.ts` — полный список опций, включая `defParamCharset`
- `@nestjs/common/pipes/file/file-type.validator.js` — поведение при отсутствии `file.buffer`
- `@nestjs/common/file-stream/streamable-file.d.ts`, `interfaces/streamable-options.interface.d.ts` — API `StreamableFile`
- `multer/lib/make-middleware.js`, `multer/lib/remove-uploaded-files.js`, `multer/storage/disk.js` — механика очистки и `mkdirSync` для строкового `destination`
- `next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` — `params` в клиентских компонентах
- `@heroui/react/dist/components/index.d.ts`, `components/progress-bar/progress-bar.d.ts` — состав экспортов и API `ProgressBar`
