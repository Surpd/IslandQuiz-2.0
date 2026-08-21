---
name: islandquiz-theme-system
description: Design or review IslandQuiz player themes and Builder live previews while preserving the shared theme source, readability, responsive intensity, and accessible motion.
metadata:
  short-description: IslandQuiz theme system rules
---

# IslandQuiz theme system

Use this skill whenever a task changes a player theme, Builder theme preview,
theme selection, themed motion, or the visual relationship between Builder and Player.
Do not change production UI merely by loading this skill. Inspect the actual affected
routes/components and `frontend/src/styles.css` before implementation.

For a large Theme System change, follow the autonomous design gate:
`DISCOVER → DIVERGE → CRITIQUE → SELECT → REFINE → PRESENT → HANDOFF`.
Explore 3-5 materially different theme directions internally, select the best balance
of ambition, usability, and feasibility, then present one finished recommendation plus
2-3 visually rendered alternatives. Do not ask the user to choose colors, gradients,
particle counts, opacity, radii, or other intermediate details. Stop for approval after
the visual presentation; coding starts only after approval unless explicitly requested.

Visual output is required for visual-led Theme System work when a callable visual tool
exists. The recommended presentation includes Builder/theme-selector context, Builder
Hero, Player desktop, and Player mobile. The exploration board needs only one useful
representative frame per alternative. Include tool-returned URLs/attachments and never
claim a frame exists without a successful tool result.

## Source of truth and relationship

- `frontend/src/lib/types.ts` defines `PlayerTheme` and `PLAYER_THEMES`:
  `amber` (Amber Gold), `midnight` (Midnight), `classic` (Classic Blue), `ocean`
  (Ocean Deep), and `forest` (Forest).
- `frontend/src/styles.css` defines the `--pt-*` tokens and `.pt-*` variants.
- `ThemeSelect` is the author-facing selector.
- `BuilderShell` uses the selected theme for the Builder Hero live preview. The hero
  preview is a preview of the player language, not a separate theme source.
- `PlayerShell` applies the same theme source to the player through `data-scope="player"`
  and the matching `pt-*` class. Do not fork theme values between Builder and Player.

## Theme matrix

| Theme | Current visual language | Current core tokens/motifs |
| --- | --- | --- |
| Midnight | focused night sky | indigo/violet on near-black; stars/twinkle |
| Amber Gold | warm, celebratory, premium | dark brown/gold; sparks/floating particles |
| Classic Blue | structured/classic quiz | navy/blue; geometric circles/squares/triangles |
| Ocean Deep | submerged, calm, fluid | deep teal/blue; bubbles rising |
| Forest | organic, natural, grounded | deep green/lime; falling leaves and sway |

Themes must differ through background treatment, surface/border texture, accent
behavior, decorative motif, and motion language—not by swapping one color value.
Avoid making every theme equally bright, noisy, or animated.

Critique each direction for visual quality, gameplay readability, IslandQuiz identity,
desktop/mobile intensity, accessibility, reduced motion, performance, technical
feasibility, consistency, and implementation complexity. Preserve strong alternatives
for the exploration board; do not show raw experiments.

## Builder Hero live preview

The Builder Hero is the first feedback that theme selection worked. It should preview:

- the background mood/gradient;
- accent and contrast direction;
- the theme motif at restrained intensity;
- the title/toolbar relationship and content safe zone.

Keep authoring controls legible and actionable. The Builder mobile hero currently
reduces/removes the large decorative treatment; preserve that density decision unless
the task explicitly revisits it. A preview mismatch between Builder and Player is a
theme-system defect, not an invitation to add a second theme model.

## Player behavior and safe content zone

- `PlayerShell` content is `relative z-10`; decorative backgrounds are
  `pointer-events-none` and must remain behind content.
- Questions, options, timer, score, progress, and primary navigation are the safe
  content zone. They must remain readable on the darkest and brightest parts of every
  background.
- Use themed surfaces/borders for grouping, but do not let glow, gradients, particles,
  or SVG decoration reduce text/option contrast.
- Answer choices need obvious default, hover/focus, selected, correct, incorrect,
  disabled, and timeout states. State must not be communicated by color alone.
- Keep timers and urgent states recognizable without causing distracting motion.

## Desktop/mobile intensity

- Desktop can carry the full motif when it does not compete with the task.
- Mobile has less viewport area and more touch/cognitive pressure: reduce particle
  count, opacity, movement distance, and visual complexity; preserve the safe zone and
  bottom navigation/keyboard offsets.
- The Builder currently hides its decorative background on mobile; Player decoration
  is shared through `AnimatedBackground` and must be checked separately on mobile.
- Test at narrow mobile, normal desktop, and wide desktop. Do not assume a desktop
  gradient will have the same contrast or crop on mobile.

## Motion and implementation constraints

- Prefer CSS transitions/keyframes and lightweight SVG for existing motifs.
- Respect `prefers-reduced-motion: reduce`: pause/shorten ambient loops and remove
  transform-heavy effects while preserving state feedback and progress information.
- Keep decorative animation deterministic/stable across rerenders; it must not jitter
  because a timer or answer state re-rendered the player.
- Use WebGL/heavy canvas only when a concrete requirement cannot be met with CSS/SVG,
  and record the performance/accessibility tradeoff before implementation.
- Do not add a theme-specific font, asset pipeline, persistence shape, or route contract
  for a visual-only change.

## Research and generation budget

Use cheap research and local reasoning first. Mobbin/web research may inform patterns;
Figma is preferred for visual frames and comparison boards; Higgsfield or other
credit-consuming generators are reserved for targeted atmosphere/motion exploration
after a direction exists. UI UX Pro Max and 21st.dev are optional and must be reported
unused when unavailable. Treat 3-5 initial external generations and 1-2 targeted
winner refinements as the normal budget for one large task. Do not reroll endlessly,
buy credits, or use generation when CSS/SVG/Figma/local reasoning is enough. If a
free-tier limit is reached, continue with available means and report it.

## Theme-system acceptance criteria

A theme-system change is ready for implementation only when the handoff states:

1. the single source of theme values and every affected consumer;
2. how Builder Hero and Player remain visually aligned;
3. desktop/mobile intensity and the content safe zone;
4. all relevant interaction states and readable contrast expectations;
5. reduced-motion behavior and performance constraints;
6. what remains unchanged in game data, routing, save/play, and result semantics.

The final presentation must also state the selected concept, briefly explain rejected
alternatives, link/attach the visual result, list tools actually used, and report the
approximate generation/refinement count and any credit limitation.
