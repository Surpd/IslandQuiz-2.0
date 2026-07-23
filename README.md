# 🏝️ IslandQuiz

Платформа для создания и проведения викторин. Три формата: Квиз, Своя игра (Jeopardy), Миллионер. Онлайн-комнаты для игры в реальном времени. AI-помощник для генерации вопросов.

## 🚀 Демо

[https://islandquiz.pages.dev](https://islandquiz.pages.dev)

## ✨ Возможности

- **6 типов вопросов:** ABCD, Да/Нет, Текст, Пары, Пропуски, Порядок
- **AI-генерация:** создание вопросов, квизов и категорий через Groq
- **Онлайн-комнаты:** игра в реальном времени (Quiz + Jeopardy)
- **Библиотека:** поиск, теги, рейтинг, публичные игры
- **Дашборды:** статистика прохождений, детализация ответов
- **Темы:** Amber, Midnight, Classic, Ocean, Forest
- **Экспорт:** Excel и PDF (красиво оформленный)
- **Аккаунты:** регистрация, профили, видимость игр

## 🛠 Технологии

### Фронтенд
- React + TypeScript + TanStack Router
- Tailwind CSS
- dnd-kit (drag-and-drop)
- KaTeX (LaTeX-формулы)

### Бэкенд
- FastAPI + Python
- Supabase (PostgreSQL)
- WebSocket (онлайн-комнаты)
- Groq API (AI-генерация)

### Деплой
- Фронтенд: Cloudflare Pages
- Бэкенд: Render
- База данных: Supabase
- Мониторинг: UptimeRobot

## 📦 Структура проекта

```
├── frontend/               # React-приложение
│   ├── src/
│   │   ├── routes/         # Страницы
│   │   ├── components/     # UI-компоненты
│   │   ├── lib/            # API, типы, утилиты
│   │   └── hooks/          # React-хуки
│   └── public/             # Статика (robots.txt, favicon)
├── backend/                # FastAPI-сервер
│   ├── routes/             # API-роуты
│   ├── services/           # AI-промты
│   ├── database.py         # Подключение к Supabase
│   └── main.py             # Точка входа
└── README.md
```

## 🚀 Быстрый старт

### Фронтенд
```bash
cd frontend
npm install
npm run dev
```

### Бэкенд
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Переменные окружения (бэкенд)
- `SUPABASE_URL` — URL Supabase проекта
- `SUPABASE_KEY` — service_role ключ
- `OPENAI_API_KEY` — API ключ Groq
- `JWT_SECRET` — секрет для JWT токенов

## 📝 Лицензия

MIT
```