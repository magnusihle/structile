import { TOKENS_CONTRACT_VERSION, type TokenId } from "./contract.js";
import type { ContrastRequirement, Theme } from "./theme.js";

const SHARED: Partial<Record<TokenId, string>> = {
  "typography.family.sans": "Inter, system-ui, sans-serif",
  "typography.family.mono": "JetBrains Mono, ui-monospace, monospace",
  "typography.heading.size": "20px",
  "typography.heading.lineHeight": "28px",
  "typography.heading.weight": "600",
  "typography.body.size": "14px",
  "typography.body.lineHeight": "20px",
  "typography.body.weight": "400",
  "typography.caption.size": "12px",
  "typography.caption.lineHeight": "16px",
  "typography.caption.weight": "400",
  "spacing.050": "2px", "spacing.100": "4px", "spacing.200": "8px", "spacing.300": "12px",
  "spacing.400": "16px", "spacing.600": "24px", "spacing.800": "32px",
  "motion.instant": "0ms", "motion.fast": "120ms", "motion.moderate": "200ms",
  "motion.slow": "320ms", "motion.easing.standard": "cubic-bezier(0.2, 0, 0, 1)",
  "density.compact": "0.875", "density.comfortable": "1", "density.spacious": "1.25"
};

const LIGHT_ELEVATION: Partial<Record<TokenId, string>> = {
  "elevation.000": "none",
  "elevation.100": "0 1px 2px rgba(16, 19, 24, 0.08)",
  "elevation.200": "0 2px 8px rgba(16, 19, 24, 0.12)",
  "elevation.300": "0 8px 24px rgba(16, 19, 24, 0.16)"
};

const DARK_ELEVATION: Partial<Record<TokenId, string>> = {
  "elevation.000": "none",
  "elevation.100": "0 1px 2px rgba(0, 0, 0, 0.60)",
  "elevation.200": "0 2px 8px rgba(0, 0, 0, 0.70)",
  "elevation.300": "0 8px 24px rgba(0, 0, 0, 0.80)"
};

export const defaultLightTheme: Theme = Object.freeze({
  version: TOKENS_CONTRACT_VERSION,
  mode: "light",
  tokens: Object.freeze({
    // Elevation raises lightness, matching the dark theme's direction. A "raised" surface
    // darker than the page reads as recessed, and an overlay equal to the page is invisible.
    "color.surface.sunken": "#e8eaee",
    "color.surface.default": "#f2f4f6",
    "color.surface.raised": "#fafbfc",
    "color.surface.overlay": "#ffffff",
    "color.text.primary": "#14171c",
    "color.text.secondary": "#41474f",
    "color.text.disabled": "#5f666f",
    "color.text.inverse": "#ffffff",
    "color.border.default": "#666d76",
    "color.border.subtle": "#767d86",
    "color.border.strong": "#3d434b",
    "color.accent.default": "#1a56c4",
    "color.accent.hover": "#14459c",
    "color.accent.contrast": "#ffffff",
    "color.status.success": "#186a3d",
    "color.status.warning": "#7a4b00",
    "color.status.danger": "#b00020",
    "color.status.info": "#15537f",
    "color.brand.logo": "#1a56c4",
    ...SHARED, ...LIGHT_ELEVATION
  } as Record<TokenId, string>)
});

export const defaultDarkTheme: Theme = Object.freeze({
  version: TOKENS_CONTRACT_VERSION,
  mode: "dark",
  tokens: Object.freeze({
    "color.surface.default": "#0f1216",
    "color.surface.raised": "#171b21",
    "color.surface.sunken": "#0a0c0f",
    "color.surface.overlay": "#1d222a",
    "color.text.primary": "#f2f4f7",
    "color.text.secondary": "#c3c9d2",
    "color.text.disabled": "#98a0ab",
    "color.text.inverse": "#0f1216",
    "color.border.default": "#8b939e",
    "color.border.subtle": "#79818c",
    "color.border.strong": "#b7bfca",
    "color.accent.default": "#8fb4fb",
    "color.accent.hover": "#adc8fc",
    "color.accent.contrast": "#0f1216",
    "color.status.success": "#5fd08a",
    "color.status.warning": "#e0a63a",
    "color.status.danger": "#f28b82",
    "color.status.info": "#7fb6ea",
    "color.brand.logo": "#8fb4fb",
    ...SHARED, ...DARK_ELEVATION
  } as Record<TokenId, string>)
});

/**
 * Pairs the runtime is allowed to place together, and the size class each must clear.
 * The protected DS-001 suite owns the numeric minimums (4.5:1 body, 3:1 large and UI);
 * this list only declares which pairs exist so none can be quietly omitted.
 */
// A frozen array whose members are mutable is not a contract, so each entry is frozen too.
export const contrastRequirements: readonly ContrastRequirement[] = Object.freeze(([
  { foreground: "color.text.primary", background: "color.surface.default", level: "body" },
  { foreground: "color.text.primary", background: "color.surface.raised", level: "body" },
  { foreground: "color.text.primary", background: "color.surface.sunken", level: "body" },
  { foreground: "color.text.primary", background: "color.surface.overlay", level: "body" },
  { foreground: "color.text.secondary", background: "color.surface.default", level: "body" },
  { foreground: "color.text.secondary", background: "color.surface.raised", level: "body" },
  { foreground: "color.text.disabled", background: "color.surface.default", level: "large" },
  { foreground: "color.text.inverse", background: "color.accent.default", level: "body" },
  { foreground: "color.border.default", background: "color.surface.default", level: "ui" },
  { foreground: "color.border.subtle", background: "color.surface.default", level: "ui" },
  { foreground: "color.border.strong", background: "color.surface.default", level: "ui" },
  { foreground: "color.accent.default", background: "color.surface.default", level: "body" },
  { foreground: "color.accent.hover", background: "color.surface.default", level: "body" },
  { foreground: "color.accent.contrast", background: "color.accent.default", level: "body" },
  { foreground: "color.status.success", background: "color.surface.default", level: "body" },
  { foreground: "color.status.warning", background: "color.surface.default", level: "body" },
  { foreground: "color.status.danger", background: "color.surface.default", level: "body" },
  { foreground: "color.status.info", background: "color.surface.default", level: "body" },
  { foreground: "color.brand.logo", background: "color.surface.default", level: "ui" }
] as const).map((entry) => Object.freeze(entry)));
