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

1. **Quiz builder/player mobile polish** — formula panel, длинные ответы и matching/pairs, компактные result stats. Первый slice для demo flow.
2. **Profile mobile actions** — проверить перенос кнопок и поля на 360–430px.
3. **Admin usability** — search users/games и понятное отображение ban/status.
4. **Admin AI lab** — привести limits/logs/test UI к понятным состояниям.
5. **Jeopardy builder mobile mode** — tile/grid presentation for narrow screens.
6. **FAQ and feedback follow-up** — структурировать FAQ; отдельно проверить feedback delivery, confirmation и spam protection.

## Mobile target

Проверка каждого slice: ширина 360–430px без горизонтального overflow и без регрессии desktop layout.
