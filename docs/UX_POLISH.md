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
2. **Mobile navigation + Create** — five-item application navigation, mobile Create sheet and desktop-only header menus. DONE.
3. **Library mobile pass** — компактный вертикальный список карточек, tabs/search/filter controls. DONE.
4. **Quiz Builder mobile pass** — sticky question navigator, compact question cards and mobile-friendly scrolling. DONE.
5. **Quiz player mobile polish** — formula panel, длинные ответы и matching/pairs, компактные result stats. DONE.
6. **Jeopardy builder mobile mode** — tile/grid presentation for narrow screens. DONE.
7. **Builder mobile action hierarchy** — contextual header, compact settings and secondary action sheets.
8. **Quiz Builder question navigator** — add-question entry in the existing sticky navigator.
9. **Builder Game Info/settings** — compact collapsible game information and mobile-safe settings presentation.
10. **Library final mobile pass** — единая компактная card system и simplified card actions.
11. **Game Details mobile hierarchy** — Play/Edit/Results primary actions and unified export/rare-actions entry points.
12. **Results mobile structure** — compact summary, attempt cards and expandable details.
13. **Profile + Join mobile polish** — stacked profile actions and Join navigation/layout.
14. **Admin usability** — search users/games и понятное отображение ban/status.
15. **Admin AI lab** — привести limits/logs/test UI к понятным состояниям.
16. **FAQ and feedback follow-up** — структурировать FAQ; отдельно проверить feedback delivery, confirmation и spam protection.

## Mobile UX direction

Mobile остаётся компактной responsive-адаптацией текущего IslandQuiz: используются существующие design tokens, шрифты, радиусы, карточки и акцентные цвета. Desktop сохраняет полноценное рабочее пространство учителя; mobile получает bottom navigation и более плотную компоновку только на узких экранах.

## Уже сделано

- Shared mobile bottom navigation для Главной, Библиотеки, Создать и Профиля.
- Mobile navigation теперь включает Join; Create открывает compact sheet с Quiz, Jeopardy и Millionaire.
- Mobile logo menu и account dropdown скрыты; desktop menu и account actions сохранены.
- Bottom navigation показывается на Home, Library, Game Details, Builder, Results, Profile и Join; immersive `/play` и `/room` routes остаются без неё.
- Root layout добавляет mobile safe-area bottom padding для application screens.
- Builder получил mobile contextual header вместо fixed action rail над bottom nav: Save/status, Play, Settings, More и Private/Public control.
- Builder save status сравнивает текущий config/questions/tags с последним сохранённым snapshot и показывает dirty/saving/saved/error states.
- Desktop Builder actions и технический `link` visibility state сохранены.
- Builder help button поднят выше mobile bottom nav.
- Quiz Builder navigator получил `+` с компактным выбором существующих типов вопросов; добавление использует тот же `addQuestion(type)` flow.
- Sticky Quiz navigator сдвинут ниже contextual Builder header и сохраняет обычный vertical question scroll.
- Quiz/Jeopardy/Millionaire builders получили collapsible `Об игре` с title/context, существующими description/tags и отдельным входом в Settings.
- Settings panel на mobile ограничен viewport по высоте и прокручивается внутри, desktop presentation сохранена.
- Library cards получили mobile-compact variant: один layout для всех tabs, type icon, title/summary, 1–2 tags +N, rating/plays и Play/Add actions; Edit/⋯ остаются desktop/Details actions.
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
