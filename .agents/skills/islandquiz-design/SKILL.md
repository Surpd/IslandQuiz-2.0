---
name: islandquiz-design
description: Audit or design IslandQuiz UI/UX from the real existing visual language, with implementation-ready desktop/mobile recommendations and no automatic code changes.
metadata:
  short-description: IslandQuiz UI/UX audit and design handoff
---

# IslandQuiz design language

Use this skill for UI/UX audits, screen redesigns, component proposals, responsive
behavior, accessibility review, or large visual changes. It is a design handoff, not
permission to edit production UI. Read the affected route/component in addition to
this snapshot when the task is concrete; the code remains the source of truth when
this document and the implementation disagree.

For large visual work, use the autonomous workflow:
`DISCOVER → DIVERGE → CRITIQUE → SELECT → REFINE → PRESENT → HANDOFF`.
Do not ask the user to choose intermediate gradients, spacing, radii, opacity, or
obvious UX details. Ask only for a critical product constraint that cannot be inferred
from the product, code, docs, skills, or prior decisions. After PRESENT/HANDOFF, stop
at the user-approval gate; implementation is a separate step unless explicitly
requested.

## Internal exploration and visual output

For a large visual change, develop 3-5 materially different concepts. They must differ
in composition, hierarchy, interaction model, or visual philosophy—not just color,
spacing, radius, or decoration count. Critique them on visual quality, UX,
readability, IslandQuiz identity, desktop/mobile behavior, accessibility, motion,
performance, consistency, feasibility, and implementation complexity. Select the
strongest balance of ambition × usability × feasibility; do not default to the safest
concept.

When appearance is the main subject, a text-only handoff is incomplete if a visual
artifact tool is available. PRESENT must include:

- `RECOMMENDED`: one polished visual result with relevant states;
- `EXPLORATION`: 2-3 strong alternatives, each represented by one useful frame/state;
- artifact URLs, attachments, or tool-returned references that let the user see them.

For Theme System/Player work, the recommended result covers Builder/theme-selection
context, Builder Hero, Player desktop, and Player mobile; add answer, result, or motion
states when they affect the decision. Do not show raw experiments. If no visual tool
is callable, say so clearly and do not pretend that a visual result was produced.

Use the compact final format: recommended concept (3-5 sentences, desktop/mobile,
LOW/MEDIUM/HIGH complexity), alternatives (one idea/advantage/rejection reason each),
implementation handoff, and tools/budget. Do not dump the full research process.

## Tool and credit discipline

Check the current callable tools before using or claiming them. Prefer cheap local
reasoning and targeted Mobbin/web research before generation. Prefer Figma for visual
frames and comparison boards; use Higgsfield or another generative tool only for a
targeted atmosphere/motion/illustration reference after direction is chosen. UI UX Pro
Max and 21st.dev are optional and must be reported unused when absent. Research is a
reference, not a final design, and must not be copied wholesale.

Treat 3-5 initial external visual generations and 1-2 targeted winner refinements as
the normal budget for one large task. Do not spend credits on endless rerolls or tiny
polish that CSS, SVG, Figma editing, or local reasoning can solve. Never purchase or
upgrade credits. If a free-tier limit is reached, continue with available tools and
report the limitation.

## Current product character

IslandQuiz currently combines a bright, friendly “tropical modern” authoring chrome
with a more immersive themed player. Preserve the contrast: the builder/library/admin
surfaces are clean and light, while the player can be atmospheric and game-like.

Primary source: `frontend/src/styles.css`.

### Palette and tokens

- Chrome background `#f8fafc`, surface `#ffffff`, muted surface `#f1f5f9`.
- Foreground `#0f172a`; muted foreground is approximately 55% slate opacity.
- Primary teal `#0d9488`, primary soft `rgba(13,148,136,.1)`.
- Accent coral `#f43f5e`, accent soft `rgba(244,63,94,.1)`.
- Amber `#f59e0b`, success `#10b981`, danger `#ef4444`, each with a soft token.
- Borders are intentionally quiet: `rgba(15,23,42,.06)` and strong borders at `.12`.
- Default radius is `1rem`; `surface-card` uses the 2xl radius (`1.5rem`) and
  `shadow-soft`. `shadow-lift`, `shadow-brand`, and `shadow-accent` are existing
  elevation vocabulary.
- Do not introduce a competing palette, arbitrary hard-coded brand colors, or a new
  radius/elevation scale for a local screen without a documented reason.

### Typography and spacing

- Body is Inter; headings use Montserrat (`font-display`) with tight letter spacing.
- Headings are typically bold/black and compact; supporting copy is muted and concise.
- Layout follows Tailwind's 4px rhythm. Existing common values include 0.5/0.75/1rem
  control padding, 1rem/1.5rem card radii, `gap-2` to `gap-6`, and max-width `7xl`.
- Desktop content normally uses `px-4` to `px-6`, with larger page rhythm at `py-8`
  to `py-10`. Mobile must retain breathing room while reserving the bottom-nav area.

### Controls, cards, overlays

- `.btn-primary`: dark foreground pill, compact/medium emphasis, white text.
- `.btn-accent`: coral, stronger CTA, larger radius and accent shadow.
- `.btn-ghost`: light surface with quiet border, useful for secondary actions and
  toolbar controls. Hover generally lifts contrast through muted surface changes.
- `input-base`: 0.75rem radius, subtle border, teal focus border and 3px focus halo;
  mobile inputs use at least 1rem text to avoid zoom.
- `surface-card`: white surface, quiet border, large radius, soft shadow. Cards are
  content containers, not decorative frames around every element.
- Dialogs use a dimmed/backdrop layer and a raised surface. Desktop dialogs are
  centered; mobile dialogs/settings/import/preview become bottom sheets with
  `rounded-t-3xl`, safe-area padding, scrollable content, and a clear close action.
- Preserve keyboard escape, semantic dialog labels, visible focus, and non-color-only
  status communication when changing these patterns.

## Screen-specific language

### Library

`frontend/src/routes/library.tsx` is a calm discovery/manage surface: a 7xl page,
small primary badge, display heading, tab/filter row, skeletons, an intentional empty
state, and responsive game cards. Cards use surface-card, compact metadata/tags, and
clear Play/Preview/Edit actions. Desktop is a 3-column grid at large widths; mobile
collapses to a single-column, touch-friendly flow. Preview is a scrollable modal and
must not become a second navigation system.

### Builder

`BuilderShell` and `BuilderToolbar` establish the authoring hierarchy. On desktop,
`builder-hero` is the live theme preview header: title/context plus a dark
`.builder-cmd-deck` command strip. The left sidebar is sticky on large screens;
settings are an inline card on desktop and a bottom sheet on mobile. Save is a fixed
primary action and must remain above the mobile bottom navigation. At mobile widths,
the hero chrome is deliberately reduced, toolbar/settings become touch-first, and
the question navigation uses the measured mobile header offsets.

Do not make an authoring control look like a player answer choice. Keep destructive or
advanced actions secondary and preserve import/export/settings affordances.

### Admin

`frontend/src/routes/admin.tsx` is denser and operational: desktop sidebar, compact
metric cards, tables, filters and status colors; mobile uses a menu sheet, stacked
cards, horizontal overflow only where tabular data needs it, and sticky bulk actions.
Do not apply playful player decoration to admin workflows. Preserve scanability,
status labels, readable tables, and the existing mobile sheet pattern.

### Player

`PlayerShell` applies `data-scope="player"` and the selected `pt-*` theme tokens;
`AnimatedBackground` supplies theme-specific, pointer-events-none CSS/SVG decoration.
Question/options content sits above the decoration (`relative z-10`) and must remain
the visual priority. Keep answer targets generous, state changes explicit, timer
urgency understandable, and text readable against each theme.

### Results

Results use the same light chrome and surface-card vocabulary. Desktop may use tables
for detailed answers; mobile switches to expandable/result cards. Keep score, accuracy,
completion state, and next action visible before dense detail. Never rely only on red/
green: pair color with icon, label, or text.

### Mobile navigation

`MobileBottomNav` is fixed, five-column, safe-area aware, and visible below the md
breakpoint. It contains Home, Library, Create, Join, and Profile. Create opens a
bottom sheet, not a full page. Any fixed save/action control must account for this
navigation and `env(safe-area-inset-bottom)`.

## Responsive and quality baseline

- The practical mobile/desktop boundary is the existing md behavior (CSS media rules
  at 767px); do not add a competing breakpoint casually.
- Test narrow mobile, a normal desktop, and wide desktop. Builder has a special wide
  layout at 1440px; preserve intentional changes in density and hero orientation.
- Reserve a content safe zone for title, question, options, timer, navigation, and
  fixed actions. Decorative layers must not intercept input or compete with text.
- Use semantic headings, labels, `aria-*` state, keyboard-operable controls, visible
  focus, sufficient contrast, and touch targets appropriate for mobile.
- Existing motion includes short fade/slide/scale feedback and themed background
  loops. Motion should clarify state or hierarchy, not delay answering or navigation.
  Every new animation must have a `prefers-reduced-motion: reduce` behavior; do not
  use random/jittering motion in content-bearing UI.

## Do-not-break rules

- Do not replace the existing token vocabulary or create a parallel design system.
- Do not change `games.data`, game themes, answer/result semantics, route behavior,
  permissions, or save/play flows as part of a visual task.
- Do not remove the mobile bottom nav, safe-area offsets, responsive sheet behavior,
  or the desktop/mobile split of dense tables without an explicit product decision.
- Do not put decorative backgrounds above interactive content, reduce question/option
  contrast, or make fixed actions overlap navigation/keyboard safe areas.
- Do not use heavy WebGL for a visual effect when CSS/SVG and existing theme tokens
  can express it.

## Handoff format

Return:

1. screens/states inspected and evidence files;
2. what stays unchanged;
3. prioritized issues or opportunities;
4. desktop/mobile behavior;
5. token/component changes, exact states, and motion/accessibility rules;
6. implementation acceptance criteria and risks.

For a large visual change, ask the `designer` read-only agent to produce this handoff
before implementation. The coding agent then implements only the accepted scope, and
the reviewer verifies the resulting states against the handoff.
