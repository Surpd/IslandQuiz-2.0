# Theme Engine

Theme Engine is the runtime renderer for player themes. The current `main` flow keeps theme selection outside game data: Play Setup chooses a runtime theme, Offline passes it through the launch query, and Online carries the host-selected theme in room state. `classic` remains the default.

## Runtime integration

- `frontend/src/theme-engine/types.ts` defines theme, layer, event, and renderer contracts.
- `frontend/src/theme-engine/registry.ts` registers the available runtime themes.
- `frontend/src/theme-engine/scene-renderer.tsx` renders the selected theme's layers and event manager.
- `frontend/src/theme-engine/event-manager.tsx` schedules theme events without backend requests.
- `frontend/src/theme-engine/themes/night-sky/theme.ts` defines Night Sky (`midnight`).
- `frontend/src/components/animated-bg.tsx` delegates registered themes to Theme Engine and preserves the existing fallback renderers for other themes.

## Night Sky

Night Sky uses the selected Atmosphere Pack v3 assets for background, nebula, aurora, fog, stars, moon, mountains, water, and grass. Tiny, medium, and bright star fields are rendered from their SVG assets; a limited DOM subset supplies independent runtime twinkle cycles (4 tiny, 14 medium, and 8 bright stars) without animating hundreds of nodes.

Nebula, aurora, fog, and air-haze use the final slow CSS animation definitions from the feature branch. Fog/Air uses integer stacking order. Cosmic Dust and the ambient Moon Glow layer are intentionally absent from the render stack. The existing `moon-glow-boost` event definition remains an explicit event contract and is not a persistent layer.

## Scope of this integration

The Builder, Builder theme selector/preview, game-data theme persistence, Play Setup implementation, launch routes, room contracts, other themes, and production debug UI were not copied from `feature/theme-engine`. Play Setup remains the only place where the runtime world is selected.
