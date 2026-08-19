# IslandQuiz — UX polish

## Owner observations

- На главной отображается двойной footer.
- Formula panel в вариантах ответа перекрывается на mobile.
- Длинные answers/matching pairs плохо выглядят в mobile player.
- Result statistics занимает слишком много места на mobile.
- Profile buttons/actions вылезают за поля на mobile.
- В admin users/games нужен search.
- Admin ban/status display confusing.
- Admin AI lab / limits / logs выглядят недоделанными или непонятными.
- Jeopardy builder list mode неудобен на mobile; tile/grid лучше для mobile.
- FAQ в целом норм, но позже можно структурировать и сократить.
- Feedback form нужно проверить: доставка, confirmation и spam protection.

## Slices

1. **Shared mobile shell** — bottom navigation для home/library/builder/profile и единый footer. DONE.
2. **Library mobile pass** — компактный вертикальный список карточек, tabs/search/filter controls. DONE.
3. **Quiz Builder mobile pass** — sticky question navigator, compact question cards and mobile-friendly scrolling. DONE.
4. **Quiz player mobile polish** — formula panel, длинные ответы и matching/pairs, компактные result stats. DONE.
5. **Jeopardy builder mobile mode** — tile/grid presentation for narrow screens. DONE.
6. **Profile mobile actions** — проверить перенос кнопок и поля на 360–430px.
7. **Admin usability** — search users/games и понятное отображение ban/status.
8. **Admin AI lab** — привести limits/logs/test UI к понятным состояниям.
9. **FAQ and feedback follow-up** — структурировать FAQ; отдельно проверить feedback delivery, confirmation и spam protection.

## Mobile UX direction

Mobile остаётся компактной responsive-адаптацией текущего IslandQuiz: используются существующие design tokens, шрифты, радиусы, карточки и акцентные цвета. Desktop сохраняет полноценное рабочее пространство учителя; mobile получает bottom navigation и более плотную компоновку только на узких экранах.

## Уже сделано

- Shared mobile bottom navigation для Главной, Библиотеки, Создать и Профиля.
- Убран дублирующий footer на главной: теперь footer рендерится только из root layout.
- Builder floating actions подняты выше mobile navigation.
- Formula panel, длинные ответы, matching/pairs и result stats получили первый mobile polish slice.
- Library получила вертикальный mobile list, горизонтально прокручиваемые tabs/tag filters, компактный search/sort row и actions Играть / Редактировать / ⋯.
- Quiz Builder получил mobile-only sticky navigator: позиция «Вопрос N из M», ‹/›, горизонтальный ряд номеров, переход к вопросу по тапу и active/completed/empty markers.
- Вертикальный список вопросов и desktop sidebar сохранены; mobile question cards стали компактнее, а builder actions остаются выше bottom navigation.
- Jeopardy Builder на narrow screens открывает grid/tile mode по умолчанию; list остаётся доступным вторичным переключателем.
- Jeopardy question tiles и category actions получили touch-friendly размеры, длинные поля ограничены контейнером, а редактирование открывается в прокручиваемом mobile bottom-sheet.
- Question editor вынес formula/AI actions из полей на mobile, сделал длинный ответ многострочным и поднят выше bottom navigation через modal safe-area.

## Остаётся

- Дальнейшая проверка Library actions и реальных 360–430px screenshots после подключения browser runtime.
- Более глубокая настройка Builder toolbar/export/settings на mobile.
- Profile/Admin pass и feedback delivery check.

## Mobile target

Проверка каждого slice: ширина 360–430px без горизонтального overflow и без регрессии desktop layout.
