# video-meeting

Монорепозиторий (npm workspaces) для видео-конференц сервиса.

## Структура

```
video-meeting/
├── apps/
│   ├── backend/    # NestJS API
│   └── frontend/   # Next.js (App Router) + HeroUI + Tailwind CSS v4
├── package.json    # корневой workspace-конфиг
├── .prettierrc.json
└── .eslintrc / eslint.config.mjs — свои в каждом пакете
```

## Требования

- Node.js >= 20
- npm >= 10 (workspaces)

## Установка

```bash
npm install
```

Ставит зависимости для корня и обоих пакетов (`apps/backend`, `apps/frontend`) за один проход.

## Запуск в режиме разработки

```bash
npm run dev:backend   # NestJS, http://localhost:4000
npm run dev:frontend  # Next.js, http://localhost:3000
```

Backend по умолчанию слушает порт `4000` (переопределяется через `PORT`), CORS включён — фронтенд на `3000` может обращаться к нему напрямую.

## Прочие команды (запускаются для всех пакетов сразу)

```bash
npm run build   # build backend + frontend
npm run lint    # eslint backend + frontend
npm run test    # jest (backend)
npm run format  # prettier --write по всему репозиторию
```

Для одного пакета: `npm run <script> -w backend` / `-w frontend`.

## Backend (apps/backend)

NestJS, стандартная структура CLI-генератора: `src/main.ts`, `src/app.module.ts`, тесты в `test/`. ESLint (flat config) + Prettier настроены из коробки.

## Frontend (apps/frontend)

Next.js App Router, TypeScript, Tailwind CSS v4, [HeroUI](https://www.heroui.com/) (v3) в качестве UI-библиотеки.

- `src/app/providers.tsx` — обёртка с `next-themes` (поддержка светлой/тёмной темы через класс `.dark`)
- `src/app/globals.css` — подключение `tailwindcss` и `@heroui/styles`
- Пример использования компонента HeroUI — `<Button>` на главной странице (`src/app/page.tsx`)

## Линтинг и форматирование

- Prettier настроен один раз на уровне корня (`.prettierrc.json`, `.prettierignore`) и применяется ко всему репозиторию.
- ESLint настроен отдельно в каждом пакете (flat config), т.к. backend и frontend используют разные наборы правил (NestJS/typescript-eslint vs eslint-config-next); в обоих подключён `eslint-config-prettier`, чтобы стилистические правила ESLint не конфликтовали с Prettier.
