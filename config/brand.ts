/**
 * Single source of truth for brand identity. The product name may change, so
 * components must read from here (never hard-code "Landed" or the domain).
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Landed",
  tagline: "Your words, your facts, tidied up.",
  description:
    "Turn your real experience into a clear CV and a short, human application email for a specific job.",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://landed.realplannet.com",
  parent: { name: "Real Plannet", url: "https://realplannet.com" },
  contactEmail: "privacy@realplannet.com",
  colors: {
    // Used for the PWA manifest and meta theme-color. UI colours live in CSS tokens.
    primary: "#1f4d3a",
    background: "#fbfaf7",
    backgroundDark: "#121614",
  },
} as const;

export type Brand = typeof brand;
