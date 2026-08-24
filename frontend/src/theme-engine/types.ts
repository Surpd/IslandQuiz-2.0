export type ThemeMode = "preview" | "full";
export type ThemePlacement = "player" | "builder" | "card";
export type ThemeAnimation =
  | "none"
  | "twinkle"
  | "breath"
  | "drift"
  | "float"
  | "shimmer"
  | "glow"
  | "wave"
  | "star-tiny"
  | "star-medium"
  | "star-bright"
  | "dust-drift"
  | "nebula-density"
  | "aurora-depth"
  | "nebula-breathe"
  | "aurora-flow"
  | "mist-far"
  | "mist-near"
  | "mist-haze"
  | "grass-sway"
  | "water-ripple"
  | "water-shimmer"
  | "cloud-drift"
  | "cloud-glow";
export type ThemeLayerFit = "cover" | "contain";
export type ThemeLayerKind = "image" | "star-field";

export interface ThemeLayer {
  id: string;
  asset: string;
  kind?: ThemeLayerKind;
  zIndex: number;
  opacity: number;
  mobileOpacity?: number;
  blendMode?: React.CSSProperties["mixBlendMode"];
  animation?: ThemeAnimation;
  animationDuration?: string;
  animationDelay?: string;
  animationAmplitude?: string;
  animationX?: string;
  animationY?: string;
  animationRotation?: string;
  animationScale?: string;
  starCount?: number;
  renderAsset?: boolean;
  fit?: ThemeLayerFit;
  position?: React.CSSProperties;
  size?: React.CSSProperties;
  objectPosition?: string;
  mobileHidden?: boolean;
}

export type ThemeEventId = "shooting-star" | "satellite" | "aurora-pulse" | "moon-glow-boost";

export interface ThemeEventDefinition {
  id: ThemeEventId;
  durationMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  mobile?: boolean;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  layers: ThemeLayer[];
  events: ThemeEventDefinition[];
  manualEvents?: ThemeEventDefinition[];
  preview: {
    intensity: number;
    events: false;
  };
  player: {
    intensity: number;
    events: true;
  };
}
