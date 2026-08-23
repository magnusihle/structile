import { TokenContractError } from "./errors.js";

const SRGB_HEX = /^#[0-9a-f]{6}$/i;

function channel(hex: string, offset: number): number {
  const raw = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance for an sRGB colour. */
export function relativeLuminance(color: string): number {
  // Typed rejection, never a raw TypeError: a caller must be able to tell a contract
  // violation from a crash, which means validating before touching the value.
  if (typeof color !== "string") {
    throw new TokenContractError([`colour must be a string, received ${typeof color}`]);
  }
  const trimmed = color.trim();
  if (!SRGB_HEX.test(trimmed)) throw new TokenContractError([`colour must be #rrggbb sRGB, received ${color}`]);
  const value = trimmed.slice(1);
  return 0.2126 * channel(value, 0) + 0.7152 * channel(value, 2) + 0.0722 * channel(value, 4);
}

/** WCAG 2.2 contrast ratio, 1..21. Order of arguments does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
