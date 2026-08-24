# IslandQuiz — карта доступности функций

Статус: каноническая продуктовая карта фактического поведения на 2026-08-24.

Документ нужен как постоянная основа для проектирования onboarding и help-системы
через кнопку `?`. Он описывает существенные пользовательские возможности, различия
доступа и предварительную сложность объяснения. Это не security-аудит и не желаемая
roadmap: если текущее поведение неожиданно, оно зафиксировано как есть.

Основные роли: **Anonymous**, **Registered** и **Admin**. Дополнительные условия
(владелец игры, публичность, host/player, наличие результатов и режим игры) указаны
в последней колонке. Обозначения: ✅ доступно, ❌ недоступно, ⚠️ зависит от условия
или быстро не удалось однозначно подтвердить. Для Anonymous в product-flow отдельно
используются: **✅ available**, **🔒 visible + auth gate**, **— hidden**.

Метки onboarding: **CORE** — важно объяснить для нормального использования;
**DISCOVERABLE** — полезно, но легко пропустить; **OBVIOUS** — обычно понятно без
отдельного обучения; **AUTH** — реальная возможность Registered относительно гостя;
**ADMIN** — только административное обучение.

## Home / общая навигация

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Просмотр Home и описания возможностей | ✅ | ✅ | ✅ | Публичная посадочная страница | OBVIOUS |
| Переход в Quiz, Jeopardy и Millionaire Builder | ✅ | ✅ | ✅ | Builder открывается без авторизации, но сохранение защищено | CORE |
| Переход в Library и просмотр public games | ✅ | ✅ | ✅ | Anonymous видит только public | CORE |
| Переход в Join | ✅ | ✅ | ✅ | Авторизация не требуется | OBVIOUS |
| Вход / регистрация / восстановление пароля | ✅ | ✅ | ✅ | Для Anonymous доступны auth flows; Registered может выйти | CORE |
| FAQ, feedback, support, privacy и terms | ✅ | ✅ | ✅ | Публичные информационные страницы | OBVIOUS |
| Профиль и меню аккаунта | ❌ | ✅ | ✅ | Для Registered; Admin получает ссылку в Admin Panel | AUTH |

## Quiz Builder

Builder можно открыть Anonymous. Редактирование текущего локального состояния,
черновик, preview и локальное прохождение доступны без аккаунта; серверное сохранение
игры требует Registered.

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Help / короткий Quiz Builder tour | ✅ | ✅ | ✅ | Запускается вручную через `?`; добровольное приглашение показывается один раз и запоминается локально | DISCOVERABLE |
| Создать quiz builder и редактировать игру | ✅ | ✅ | ✅ | Локальный draft возможен до сохранения | CORE |
| Добавить, удалить и перетащить вопрос | ✅ | ✅ | ✅ | Drag-and-drop меняет порядок | CORE |
| Навигация по вопросам и список вопросов | ✅ | ✅ | ✅ | Sidebar/list и scroll-to-question | CORE |
| Выбрать тип вопроса | ✅ | ✅ | ✅ | ABCD, Да/Нет, Текст, Пары, Пропуски, Порядок | CORE |
| Настроить варианты и правильный ответ | ✅ | ✅ | ✅ | Зависит от типа вопроса | CORE |
| Баллы и время отдельного вопроса | ✅ | ✅ | ✅ | Настраиваются в карточке вопроса | CORE |
| Изображение в вопросе | ✅ | ✅ | ✅ | Через image drop/upload в карточке | DISCOVERABLE |
| LaTeX / формулы | ✅ | ✅ | ✅ | Кнопка `ƒx` в тексте и вариантах | DISCOVERABLE |
| AI отдельного вопроса | 🔒 | ✅ | ✅ | Кнопка видима Anonymous; использование открывает auth gate; серверный AI auth-required | AUTH |
| Полная AI-генерация quiz | 🔒 | ✅ | ✅ | Кнопка видима Anonymous; использование открывает auth gate; Quick/Advanced и material limits | AUTH |
| AI-генерация варианта quiz | — | ✅ | ✅ | Это owner/advanced Variants feature; Anonymous controls скрыты | AUTH |
| Quiz variants: создать, переключить, удалить, сравнить | — | ✅ | ✅ | Controls/Settings section скрыты Anonymous; до 4 вариантов для Registered/Admin | DISCOVERABLE |
| Название, описание и теги | ✅ | ✅ | ✅ | Теги с suggestions; сохранение на сервере требует auth | CORE |
| Настройки времени по умолчанию | ✅ | ✅ | ✅ | Применяются к новым вопросам | DISCOVERABLE |
| Показ ответов после игры | ✅ | ✅ | ✅ | Game permission setting, сохраняется вместе с игрой | DISCOVERABLE |
| Разрешить preview вопросов | — | ✅ | ✅ | Owner/library permission; Anonymous control скрыт | DISCOVERABLE |
| Разрешить копирование игры | — | ✅ | ✅ | Owner/library permission; fork требует Registered и разрешение автора | AUTH |
| Visibility: private / link / public | — | ✅ | ✅ | Owner/library control; Anonymous local draft не имеет server visibility | AUTH |
| Импорт Excel/CSV | ✅ | ✅ | ✅ | Включая drag-and-drop; поддерживаются quiz types и variants | DISCOVERABLE |
| Скачать Excel template | ✅ | ✅ | ✅ | Локальное действие | DISCOVERABLE |
| Экспорт в Excel | ✅ | ✅ | ✅ | Локальный экспорт текущего состояния | DISCOVERABLE |
| Печать / PDF | ✅ | ✅ | ✅ | Browser print view, с ответами или без | DISCOVERABLE |
| Preview / содержание игры | ✅ | ✅ | ✅ | Доступен из builder и Library; детали зависят от permissions | CORE |
| Offline play | ✅ | ✅ | ✅ | Для доступной игры; можно запустить как host на проекторе | CORE |
| Online room | 🔒 | ✅ | ✅ | Option видима Anonymous, но create/snapshot не выполняются до auth gate; host — Registered/Admin | CORE |
| Save в Library | 🔒 | ✅ | ✅ | Кнопка видима Anonymous, server save открывает auth gate; local draft не требует save | CORE |
| Save as copy / delete | — | ✅ | ✅ | Owner/library-only controls скрыты Anonymous | CORE |
| Results link после сохранения | — | ✅ | ✅ | Только для сохранённой игры и доступных результатов | DISCOVERABLE |

## Jeopardy / «Своя игра» Builder

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Создать и редактировать Jeopardy | ✅ | ✅ | ✅ | Локальный draft до сохранения | CORE |
| Раунды: добавить, удалить, переименовать и перейти к раунду | ✅ | ✅ | ✅ | Ограничения на число категорий | CORE |
| Категории: добавить, удалить, переименовать | ✅ | ✅ | ✅ | Внутри раундов | CORE |
| Вопросы категории: добавить, открыть, удалить | ✅ | ✅ | ✅ | Стоимость задаётся для каждого вопроса | CORE |
| Стоимость вопросов и структура раундов | ✅ | ✅ | ✅ | Board строится из round/category/question | CORE |
| Финальный вопрос и ставки | ✅ | ✅ | ✅ | Отдельный final block | CORE |
| AI предложить категорию | 🔒 | ✅ | ✅ | Control видим Anonymous; использование открывает auth gate | AUTH |
| AI заполнить пустые вопросы категории | 🔒 | ✅ | ✅ | Control видим Anonymous; использование открывает auth gate | AUTH |
| AI-помощник отдельного вопроса | 🔒 | ✅ | ✅ | Control видим Anonymous; использование открывает auth gate | AUTH |
| Название и теги | ✅ | ✅ | ✅ | Редактирование локально без auth; server save требует auth | CORE |
| Visibility: private / link / public | — | ✅ | ✅ | Owner/library control скрыт Anonymous | AUTH |
| Таймер раунда, шаг времени и таймер финала | ✅ | ✅ | ✅ | В Settings/Advanced settings | DISCOVERABLE |
| Показ ответов после игры | ✅ | ✅ | ✅ | Полезная настройка локального draft и сохранённой игры | DISCOVERABLE |
| Preview и copy permissions | — | ✅ | ✅ | Owner/library controls скрыты Anonymous | AUTH |
| List / Tiles view | ✅ | ✅ | ✅ | Переключатель вида builder | DISCOVERABLE |
| Импорт Excel/CSV и template | ✅ | ✅ | ✅ | Jeopardy-specific format | DISCOVERABLE |
| Экспорт Excel | ✅ | ✅ | ✅ | Локальный экспорт | DISCOVERABLE |
| Печать / PDF | ✅ | ✅ | ✅ | С ответами или без | DISCOVERABLE |
| Offline play / host projector | ✅ | ✅ | ✅ | Команды, ставки, финал и результаты | CORE |
| Online room | 🔒 | ✅ | ✅ | Option видима Anonymous, но create/snapshot не выполняются до auth gate | CORE |
| Save, Save as copy, delete, results | ❌ | ✅ | ✅ | Сохранение и owner actions требуют auth | CORE |

## Millionaire Builder

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Создать и редактировать ladder | ✅ | ✅ | ✅ | Локальный draft до сохранения | CORE |
| Добавить, удалить и перетащить вопрос | ✅ | ✅ | ✅ | Порядок вопросов образует лестницу | CORE |
| Текст вопроса и 4 варианта ответа | ✅ | ✅ | ✅ | Один вариант отмечается правильным | CORE |
| Баланс и сумма вопроса | ✅ | ✅ | ✅ | Сумма зависит от шкалы/режима очков | CORE |
| AI-помощник вопроса | 🔒 | ✅ | ✅ | Control видим Anonymous; использование открывает auth gate | AUTH |
| Время на вопрос | ✅ | ✅ | ✅ | Builder settings | DISCOVERABLE |
| Шкала призов | ✅ | ✅ | ✅ | Easy / normal / hard | DISCOVERABLE |
| Режим очков | ✅ | ✅ | ✅ | Classic / double / custom | DISCOVERABLE |
| Несгораемые суммы | ✅ | ✅ | ✅ | Classic / three / none | DISCOVERABLE |
| Название и теги | ✅ | ✅ | ✅ | Редактирование локально без auth; server save требует auth | CORE |
| Visibility: private / link / public | — | ✅ | ✅ | Owner/library control скрыт Anonymous | AUTH |
| Показ ответов после игры | ✅ | ✅ | ✅ | Полезная настройка локального draft и сохранённой игры | DISCOVERABLE |
| Preview и copy permissions | — | ✅ | ✅ | Owner/library controls скрыты Anonymous | AUTH |
| Импорт Excel/CSV и template | ✅ | ✅ | ✅ | Millionaire-specific format | DISCOVERABLE |
| Экспорт Excel | ✅ | ✅ | ✅ | Локальный экспорт | DISCOVERABLE |
| Печать / PDF | ✅ | ✅ | ✅ | С ответами или только вопросы | DISCOVERABLE |
| Offline play | ✅ | ✅ | ✅ | Подсказка 50:50 доступна игроку | CORE |
| Online room | ❌ | ❌ | ❌ | В текущем PlayModal online option скрыта для Millionaire | OBVIOUS |
| Save, Save as copy, delete, results | ❌ | ✅ | ✅ | Owner actions требуют auth | CORE |

## Library

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Просмотр public games | ✅ | ✅ | ✅ | Для гостя — только public | CORE |
| Мои игры | ❌ | ✅ | ✅ | Только игры текущего пользователя | AUTH |
| Добавленные / forked games | ❌ | ✅ | ✅ | Нужен Registered и собственная копия | AUTH |
| Пройденные игры | ❌ | ✅ | ✅ | История по авторизованному пользователю | AUTH |
| Поиск по названию и тегу | ✅ | ✅ | ✅ | Работает в текущей вкладке | CORE |
| Популярные теги / фильтр по тегам | ✅ | ✅ | ✅ | Фильтр по видимым играм | DISCOVERABLE |
| Сортировка по дате, рейтингу, прохождениям | ✅ | ✅ | ✅ | В текущем списке | DISCOVERABLE |
| Карточка: owner, visibility, rating, play count | ✅ | ✅ | ✅ | Данные зависят от доступности игры | OBVIOUS |
| Preview карточки | ✅ | ✅ | ✅ | Может быть отключён автором; owner/admin privileged | DISCOVERABLE |
| Play modal и выбор готовой темы | ✅ | ✅ | ✅ | Доступны только Classic и Night Sky; online только Quiz/Jeopardy | CORE |
| Выбор Quiz Variant в Play modal | — | ✅ | ✅ | Variant controls доступны только Registered/Admin | DISCOVERABLE |
| Открыть game page | ✅ | ✅ | ✅ | Для visible/public/link-доступной игры | CORE |
| Редактировать и удалить свою игру | ❌ | ✅ | ✅ | Только owner; Admin управляет через Admin Panel | AUTH |
| Добавить себе / fork чужой игры | ❌ | ✅ | ✅ | Public/link и allowCopy; результат private | AUTH |

## Game page

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Просмотр title, description, tags, owner и rating | ✅ | ✅ | ✅ | Игра должна быть видима пользователю | CORE |
| Preview / содержание вопросов | ⚠️ | ⚠️ | ✅ | Зависит от allowPreview и public/link; owner/admin могут видеть privileged preview | DISCOVERABLE |
| Запустить игру | ✅ | ✅ | ✅ | Offline для всех доступных game types | CORE |
| Создать online room / host | 🔒 | ✅ | ✅ | Anonymous видит возможность, но auth gate срабатывает до snapshot/WebSocket create; Millionaire исключён | CORE |
| Скопировать ссылку / share | ✅ | ✅ | ✅ | Ссылка на доступную game page | DISCOVERABLE |
| Добавить себе | ❌ | ✅ | ✅ | Fork требует auth и allowCopy | AUTH |
| Редактировать название, visibility и show answers | ❌ | ✅ | ✅ | Только owner | AUTH |
| Экспорт Excel и печать/PDF | ❌ | ✅ | ✅ | На game page показывается для owner | DISCOVERABLE |
| Удалить игру | ❌ | ✅ | ✅ | Owner через обычный UI; Admin — через Admin Panel | AUTH |
| Оценить игру | ❌ | ✅ | ✅ | Registered, не собственная игра | AUTH |
| Открыть результаты прохождений | ❌ | ✅ | ✅ | Только owner или разрешённый privileged user | DISCOVERABLE |

## Offline Player

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Ввести имя и начать игру | ✅ | ✅ | ✅ | Guest может играть как Anonymous | CORE |
| Quiz: отвечать, видеть feedback и завершить | ✅ | ✅ | ✅ | Зависит от типа вопроса и game settings | CORE |
| Quiz: выбрать готовую theme | ✅ | ✅ | ✅ | Доступны Classic и Night Sky | DISCOVERABLE |
| Quiz: выбрать Variant | — | ✅ | ✅ | Variant controls доступны только Registered/Admin | DISCOVERABLE |
| Jeopardy: команды, board, выбор вопроса, оценка ответа | ✅ | ✅ | ✅ | Host controls flow locally | CORE |
| Jeopardy: ставки и финал | ✅ | ✅ | ✅ | Входит в offline host flow | CORE |
| Millionaire: ladder, таймер, 50:50, restart | ✅ | ✅ | ✅ | Player can use one 50:50 | CORE |
| Отправить результат | ✅ | ✅ | ✅ | Anonymous result сохраняется без user_id; доступность зависит от game | OBVIOUS |
| Повторить игру | ✅ | ✅ | ✅ | Действие player flow | OBVIOUS |
| Share/QR для учеников | ✅ | ✅ | ✅ | Генерируется host flow; QR ведёт к player URL | DISCOVERABLE |

## Online Room

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Создать room | 🔒 | ✅ | ✅ | Anonymous видит возможность, но host create требует auth до snapshot/WebSocket | CORE |
| Показать room code и QR на экране host | — | ✅ | ✅ | Только после Registered/Admin create | CORE |
| Join по 4-значному коду | ✅ | ✅ | ✅ | Auth не требуется | CORE |
| Nickname и avatar/color | ✅ | ✅ | ✅ | Registered получает prefill из профиля; guest вводит вручную | CORE |
| Host: start, reveal, leaderboard, next, finish, restart | — | ✅ | ✅ | Только Registered/Admin host credential конкретной комнаты | CORE |
| Host: kick и adjust score | — | ✅ | ✅ | Host-only actions; guest Join не даёт host credential | DISCOVERABLE |
| Quiz player: answer и увидеть score/leaderboard | ✅ | ✅ | ✅ | Player credential конкретной комнаты | CORE |
| Jeopardy player: buzz/turn answer/final bet/final answer | ✅ | ✅ | ✅ | Действия зависят от phase и выбранного режима | CORE |
| Reconnect/resume room | ✅ | ✅ | ✅ | Для сохранённого room state в grace/TTL пределах | DISCOVERABLE |
| Онлайн-результаты | ✅ | ✅ | ✅ | Публикуются в host/result flow; просмотр dashboard требует доступа к игре | DISCOVERABLE |

## Join

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Ввести 4-значный code | ✅ | ✅ | ✅ | QR ведёт сюда | CORE |
| Ввести nickname | ✅ | ✅ | ✅ | Обязателен для join | CORE |
| Выбрать avatar/color | ✅ | ✅ | ✅ | Зарегистрированный получает prefill, но может изменить | DISCOVERABLE |
| Присоединиться без email/account | ✅ | ✅ | ✅ | Join flow не требует auth | OBVIOUS |
| Сохранить player identity для reconnect | ✅ | ✅ | ✅ | Session storage в браузере; зависит от браузера/кода комнаты | DISCOVERABLE |

Отдельный onboarding для Join сейчас не требуется: flow короткий и самодостаточный.

## Results

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Отправить standalone Quiz/Jeopardy/Millionaire result | ✅ | ✅ | ✅ | Во время игры; anonymous result без user account | OBVIOUS |
| Посмотреть результаты своей сохранённой игры | ❌ | ✅ | ✅ | Owner/разрешённый privileged access | CORE |
| Quiz dashboard: offline + online rows | ❌ | ✅ | ✅ | Сводка, variant filter, leaderboard, expanded answers | CORE |
| Quiz: раскрыть ответы игрока | ❌ | ✅ | ✅ | Владелец видит детали | DISCOVERABLE |
| Jeopardy dashboard и detail | ❌ | ✅ | ✅ | Команды, победитель, финал, раскрытие записи | CORE |
| Millionaire dashboard и answer details | ❌ | ✅ | ✅ | Won amount, milestones, outcome и ответы | CORE |
| История собственных прохождений в Library | ❌ | ✅ | ✅ | Вкладка Played | AUTH |
| Публичный рейтинг игры | ✅ | ✅ | ✅ | Видно на game page/library; оценка только Registered | DISCOVERABLE |
| Оценить чужую игру | ❌ | ✅ | ✅ | Нельзя оценивать собственную игру | AUTH |

## Profile

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Просмотр публичного профиля автора | ✅ | ✅ | ✅ | Переход из game/result owner cell | OBVIOUS |
| Редактировать своё имя, bio и subject | ❌ | ✅ | ✅ | Только собственный profile | CORE |
| Выбрать/загрузить/очистить avatar | ❌ | ✅ | ✅ | Color или image data | DISCOVERABLE |
| Посмотреть статистику и свои public games | ❌ | ✅ | ✅ | В private account section | OBVIOUS |
| Привязать email/password | ❌ | ✅ | ✅ | Для Telegram-only account | DISCOVERABLE |
| Привязать Telegram | ❌ | ✅ | ✅ | Для account backup/link | DISCOVERABLE |
| Удалить аккаунт и созданные игры | ❌ | ✅ | ✅ | Destructive action; подтверждение в UI | OBVIOUS |
| Открыть Admin Panel | ❌ | ❌ | ✅ | Только role=admin | ADMIN |

## AI

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| AI helper для отдельного Quiz-вопроса | 🔒 | ✅ | ✅ | Visible Anonymous; Generate 3 variants, pick, reroll после auth gate | AUTH |
| AI improve/rewrite current question | 🔒 | ✅ | ✅ | Visible Anonymous; auth gate перед helper | AUTH |
| Full Quiz generation from topic | 🔒 | ✅ | ✅ | Visible Anonymous; auth gate перед Quick/Advanced generation | AUTH |
| Advanced Quiz generation | 🔒 | ✅ | ✅ | Visible Anonymous; auth gate перед запуском | AUTH |
| Quiz generation from PDF/DOCX/TXT/MD | 🔒 | ✅ | ✅ | Visible Anonymous; upload/generation требуют auth | AUTH |
| Quiz variant generation | — | ✅ | ✅ | Owner/advanced Variants control скрыт Anonymous | AUTH |
| Jeopardy category suggestions | 🔒 | ✅ | ✅ | Visible Anonymous; использование открывает auth gate | AUTH |
| Jeopardy questions for category | 🔒 | ✅ | ✅ | Visible Anonymous; заполнение slots требует auth | AUTH |
| Admin AI analytics и AI errors | ❌ | ❌ | ✅ | Admin Panel | ADMIN |
| Admin Prompt Tester | ❌ | ❌ | ✅ | Production Groq client и prompt generators | ADMIN |
| AI limits/settings | ❌ | ❌ | ✅ | Admin управляет user/admin limits; проверка server-side | ADMIN |

Точные числовые лимиты не являются стабильной пользовательской частью этой карты:
они задаются сервером и администрируются отдельно. Для onboarding достаточно честно
показывать Anonymous controls с auth gate; фактическое использование доступно Registered и может иметь дневные/file limits.

## Import / Export

| Функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Excel/CSV import в Quiz Builder | ✅ | ✅ | ✅ | Локально загружает вопросы и variants | DISCOVERABLE |
| Excel/CSV import в Jeopardy Builder | ✅ | ✅ | ✅ | Локально загружает rounds/categories/final | DISCOVERABLE |
| Excel/CSV import в Millionaire Builder | ✅ | ✅ | ✅ | Локально загружает questions | DISCOVERABLE |
| Скачать template | ✅ | ✅ | ✅ | Отдельный template для каждого game kind | DISCOVERABLE |
| Excel export | ✅ | ✅ | ✅ | Из builder и owner game page | DISCOVERABLE |
| Browser print / Save as PDF | ✅ | ✅ | ✅ | PDF — результат browser print, не отдельный server download | DISCOVERABLE |
| AI material upload | ❌ | ✅ | ✅ | PDF/DOCX/TXT/MD только внутри AI generation | AUTH |
| Official JSON content pack import | ❌ | ❌ | ✅ | Admin-only validated import; создаёт private games | ADMIN |

## Admin

Admin в обычном пользовательском UI в основном имеет те же возможности, что и
Registered: builder, Library, play, profiles, ratings и owner actions для собственных
игр. Основные дополнительные возможности находятся исключительно в `/admin`.

| Admin Panel функция | Anonymous | Registered | Admin | Условие / примечание | Onboarding |
|---|---:|---:|---:|---|---|
| Admin Overview / dashboard | ❌ | ❌ | ✅ | KPI, activity, top games, distributions, period filter | ADMIN |
| Workspace: все игры | ❌ | ❌ | ✅ | Search, kind, visibility, author, pagination | ADMIN |
| Workspace: изменить visibility чужой игры | ❌ | ❌ | ✅ | Public/private/link | ADMIN |
| Workspace: удалить игру | ❌ | ❌ | ✅ | Включая bulk delete | ADMIN |
| Workspace: пользователи | ❌ | ❌ | ✅ | Search, role/status filters, pagination | ADMIN |
| Ban/unban пользователя | ❌ | ❌ | ✅ | Admin action | ADMIN |
| Изменить роль user/admin | ❌ | ❌ | ✅ | Admin action | ADMIN |
| Удалить пользователя | ❌ | ❌ | ✅ | Admin action | ADMIN |
| Official content import | ❌ | ❌ | ✅ | Upload/paste JSON → validate/preview → apply | ADMIN |
| Tags workspace | ❌ | ❌ | ✅ | Управление canonical tags/merge/delete paths | ADMIN |
| AI analytics | ❌ | ❌ | ✅ | Requests by period и последние AI errors | ADMIN |
| Prompt Tester | ❌ | ❌ | ✅ | Quiz/Jeopardy prompt modes, raw result | ADMIN |
| Error logs и детали ошибок | ❌ | ❌ | ✅ | Фильтры/period и detail modal | ADMIN |
| System/AI limits settings | ❌ | ❌ | ✅ | User/admin quotas, AI upload limits | ADMIN |
| Observability summary/cleanup | ❌ | ❌ | ✅ | Операционный Admin Panel capability | ADMIN |

## Access differences

### Anonymous → Registered

Реальные дополнительные возможности после регистрации:

- сохранять созданные Quiz, Jeopardy и Millionaire в серверной Library;
- иметь вкладки **Мои**, **Добавленные** и **Пройденные**;
- редактировать, удалять, менять visibility и настройки собственных игр;
- добавлять себе public/link games через fork;
- оценивать чужие игры;
- видеть собственные результаты и dashboards созданных игр;
- использовать AI question helper, full/advanced Quiz generation, file generation,
  variants и Jeopardy AI;
- редактировать профиль, avatar, bio/subject и связывать email/Telegram;
- создавать online rooms из доступных сохранённых Quiz/Jeopardy игр.

При этом Anonymous уже может полноценно попробовать продукт: открыть builder,
создать локальную игру, импортировать/экспортировать её, играть offline, смотреть
public games, отправлять anonymous results и присоединяться к online room.

### Registered → Admin

#### Обычный продуктовый UI

Различия небольшие: Admin сохраняет все Registered-возможности и получает privileged
доступ к собственным/доступным game previews и административным действиям в контексте
системы. Отдельного пользовательского режима Admin в builder/player не обнаружено.

#### Admin Panel

Admin дополнительно получает полный workspace игр и пользователей, bulk moderation,
role/ban/delete actions, official content import, tag management, AI analytics,
Prompt Tester, error/observability views и управление лимитами.

### Available to everyone

- Home, общая навигация, FAQ, support/feedback и legal pages;
- открытие Quiz/Jeopardy/Millionaire builders и локальное редактирование;
- импорт/экспорт Excel/CSV, templates и browser print/PDF;
- игра offline с именем игрока;
- просмотр и запуск доступных public/link games;
- Join по 4-значному коду, nickname и avatar/color;
- отправка anonymous standalone results;
- просмотр public profiles и публичных rating/play-count данных.

## Onboarding candidates

Это не готовые сценарии и не тексты подсказок. Это группы функций, которые стоит
рассмотреть при проектировании кнопки `?` и первого знакомства.

### Quiz Builder

**CORE**

- разница между локальным draft и сохранённой игрой;
- типы вопросов и выбор правильного ответа;
- порядок вопросов, points/time и запуск игры;
- visibility и путь от builder к Library.

**DISCOVERABLE**

- formula `ƒx`, image drop и специальные типы Pairs/Close/Ordering;
- variants и выбор варианта перед запуском;
- settings: preview, copy, show answers;
- import/template, Excel export и print/PDF;
- offline host, QR/link и online room.

**AUTH**

- почему без аккаунта draft не попадает в Library;
- AI helper/full generation и дневные limits;
- public/link visibility, save as copy и results history.

### Jeopardy Builder

**CORE**

- структура round → category → question;
- стоимость вопроса, board flow и финал со ставками;
- list/tiles navigation и запуск offline/online.

**DISCOVERABLE**

- таймеры, print answers, preview/copy/show answers;
- import/template, Excel export и PDF;
- AI category button и заполнение пустых slots.

**AUTH**

- server save/Library/visibility;
- Jeopardy AI и results dashboard.

### Millionaire Builder

**CORE**

- ladder из 4 вариантов и отметка правильного ответа;
- шкала денег, таймер, milestones и 50:50;
- offline launch и сохранение игры.

**DISCOVERABLE**

- custom/double points mode;
- AI helper, import/template, Excel export и PDF;
- preview/copy/show answers.

**AUTH**

- сохранение в Library, visibility, fork и results;
- AI generation и лимиты.

### Library

**CORE**

- вкладки public/my/added/played;
- поиск, карточка, preview и запуск;
- отличие “Добавить себе” от простого запуска.

**DISCOVERABLE**

- tag chips, sort by rating/plays/date;
- ratings, play count, owner profile;
- preview permission и online/offline выбор.

**AUTH**

- что именно появляется после регистрации: My, Added, Played, fork, rating,
  собственные games и results.

### Game page и play flow

**CORE**

- отличие owner actions от действий посетителя;
- Offline host vs Online room;
- Join code/QR и роли host/player.

**DISCOVERABLE**

- theme, quiz variants, share link, PDF/Excel;
- results details, leaderboard и повторное прохождение.

**AUTH**

- fork, rating, owner results и сохранённые игры.

Ориентировочно по этой карте найдено около **29 CORE**, **48 DISCOVERABLE** и
**24 AUTH** строк/групп; числа являются приоритетным ориентиром, а не строгим
количеством будущих tooltip-сценариев. Главные кандидаты для первого onboarding:
Quiz Builder, Jeopardy Builder, Library и разница Offline host / Online room.

## Поддержание карты

При добавлении, удалении или существенном изменении пользовательской функции нужно
проверить эту матрицу и обновить её, если изменилось фактическое поведение. Особенно
важны изменения auth/role, owner/host/player, visibility, fork, AI availability,
results или состава builder controls.

## Следующий шаг

После согласования этой карты можно отдельно спроектировать поведение кнопки `?`,
сценарий первого знакомства, последовательность spotlight/tooltips и различия
onboarding для Anonymous и Registered. Join пока достаточно оставить без отдельного
обучения.
