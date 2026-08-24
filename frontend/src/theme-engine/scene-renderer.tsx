import { memo } from "react";
import type { PlayerTheme } from "@/lib/types";
import { getThemeDefinition } from "@/theme-engine/registry";
import type { ThemeEventId, ThemeLayer, ThemeMode, ThemePlacement } from "@/theme-engine/types";
import { EventManager } from "@/theme-engine/event-manager";

const BRIGHT_STAR_POSITIONS = [
  [23.2, 6.8],
  [46.1, 53.6],
  [59.9, 5.6],
  [84.2, 33.9],
  [4.1, 40.5],
  [83.1, 88.4],
  [74.7, 24.6],
  [25.1, 85],
] as const;

export const SceneRenderer = memo(function SceneRenderer({
  theme,
  mode = "full",
  placement = "player",
  intensityOverride,
  eventsEnabled,
  reducedMotion,
  forcedEvent,
  forceEventKey,
  onActiveEventChange,
  debugAmbient = false,
}: {
  theme: PlayerTheme;
  mode?: ThemeMode;
  placement?: ThemePlacement;
  intensityOverride?: number;
  eventsEnabled?: boolean;
  reducedMotion?: boolean;
  forcedEvent?: ThemeEventId | null;
  forceEventKey?: number;
  onActiveEventChange?: (eventId: ThemeEventId | null) => void;
  debugAmbient?: boolean;
}) {
  const definition = getThemeDefinition(theme);
  if (!definition) return null;

  const intensity =
    intensityOverride ??
    (mode === "preview" ? definition.preview.intensity : definition.player.intensity);
  return (
    <div
      aria-hidden="true"
      className={`theme-scene theme-scene--${placement} theme-scene--${mode}${debugAmbient ? " theme-scene--debug-ambient" : ""}`}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      style={{ "--theme-intensity": intensity } as React.CSSProperties}
    >
      {definition.layers.map((layer) => (
        <LayerRenderer key={layer.id} layer={layer} intensity={intensity} />
      ))}
      <EventManager
        definition={definition}
        mode={mode}
        placement={placement}
        eventsEnabled={eventsEnabled}
        reducedMotion={reducedMotion}
        forcedEvent={forcedEvent}
        forceEventKey={forceEventKey}
        onActiveEventChange={onActiveEventChange}
      />
    </div>
  );
});

function LayerRenderer({ layer, intensity }: { layer: ThemeLayer; intensity: number }) {
  const style = {
    "--theme-opacity": layer.opacity * intensity,
    "--theme-mobile-opacity": (layer.mobileOpacity ?? layer.opacity) * intensity,
    zIndex: layer.zIndex,
    mixBlendMode: layer.blendMode,
    objectFit: layer.fit ?? "cover",
    objectPosition: layer.objectPosition,
    "--theme-animation-duration": layer.animationDuration,
    "--theme-animation-delay": layer.animationDelay,
    "--theme-animation-amplitude": layer.animationAmplitude,
    "--theme-animation-x": layer.animationX,
    "--theme-animation-y": layer.animationY,
    "--theme-animation-rotation": layer.animationRotation,
    "--theme-animation-scale": layer.animationScale,
    inset: layer.position || layer.size ? "auto" : 0,
    ...layer.position,
    ...layer.size,
  } as React.CSSProperties;

  if (layer.kind === "star-field") {
    return <StarField layer={layer} intensity={intensity} />;
  }

  return (
    <img
      className={`theme-layer theme-layer--${layer.animation ?? "none"} theme-layer--${layer.id}${layer.mobileHidden ? " theme-layer--mobile-hidden" : ""}`}
      src={layer.asset}
      alt=""
      draggable={false}
      style={style}
    />
  );
}

function StarField({ layer, intensity }: { layer: ThemeLayer; intensity: number }) {
  const stars = Array.from({ length: layer.starCount ?? 48 });
  const baseOpacity = layer.opacity * intensity;
  const tier =
    layer.id === "bright-stars" ? "bright" : layer.id === "medium-stars" ? "medium" : "tiny";
  const seed = tier === "bright" ? 47 : tier === "medium" ? 23 : 7;

  return (
    <div
      className={`theme-layer theme-layer--${layer.animation ?? "none"} theme-layer--${layer.id}${layer.mobileHidden ? " theme-layer--mobile-hidden" : ""}`}
      style={
        {
          "--theme-opacity": baseOpacity,
          "--theme-mobile-opacity": (layer.mobileOpacity ?? layer.opacity) * intensity,
          "--theme-animation-duration": layer.animationDuration,
          "--theme-animation-delay": layer.animationDelay,
          "--theme-animation-amplitude": layer.animationAmplitude,
          "--theme-animation-x": layer.animationX,
          "--theme-animation-y": layer.animationY,
          "--theme-animation-rotation": layer.animationRotation,
          "--theme-animation-scale": layer.animationScale,
          backgroundImage: layer.renderAsset === false ? undefined : `url("${layer.asset}")`,
          backgroundPosition: layer.objectPosition ?? "center",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          zIndex: layer.zIndex,
          mixBlendMode: layer.blendMode,
          ...layer.position,
          ...layer.size,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {stars.map((_, index) => {
        const size =
          tier === "bright"
            ? 1.8 + stableUnit(index + seed, 1) * 2.2
            : tier === "medium"
              ? 1 + stableUnit(index + seed, 1) * 1.1
              : 0.7 + stableUnit(index + seed, 1) * 0.8;
        const opacity =
          tier === "bright"
            ? 0.58 + stableUnit(index + seed, 2) * 0.32
            : tier === "medium"
              ? 0.3 + stableUnit(index + seed, 2) * 0.18
              : 0.16 + stableUnit(index + seed, 2) * 0.2;
        const duration =
          tier === "bright"
            ? 20 + stableUnit(index + seed, 3) * 12
            : tier === "medium"
              ? 8 + stableUnit(index + seed, 3) * 7
              : 18 + stableUnit(index + seed, 3) * 18;
        const ambientDuration = duration * 1.5625;
        const delay = -(stableUnit(index + seed, 4) * ambientDuration);
        const tinyIsStatic = tier === "tiny" && index % 10 !== 0;
        const mediumIsStatic = tier === "medium" && index % 2 !== 0;
        const isStatic = tinyIsStatic || mediumIsStatic;
        const brightPosition =
          tier === "bright" ? BRIGHT_STAR_POSITIONS[index % BRIGHT_STAR_POSITIONS.length] : null;

        return (
          <span
            key={index}
            className={`theme-star theme-star--${tier}${tier === "bright" ? " theme-star--bright theme-star--flash" : ""}${isStatic ? " theme-star--static" : ""}`}
            style={
              {
                width: `${size}px`,
                height: `${size}px`,
                left: `${brightPosition?.[0] ?? stableUnit(index + seed, 5) * 100}%`,
                top: `${brightPosition?.[1] ?? stableUnit(index + seed, 6) * 100}%`,
                "--star-opacity": opacity,
                "--star-duration": `${ambientDuration}s`,
                "--star-delay": `${delay}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function stableUnit(index: number, salt: number) {
  return ((index * 37 + salt * 17 + 11) % 100) / 100;
}
