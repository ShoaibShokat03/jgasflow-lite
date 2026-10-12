// src/constants/branding.js

/**
 * Branding constants for the JDent Admin panel.
 * This panel is for PLATFORM administrators (plans, clinics,
 * subscriptions, invoices) — not for subscribed clinics.
 */

export const BRANDING = {
  // Brand Name
  name: "JDent",
  shortName: "JDent",
  tagline: "Platform Admin",
  description: "Dental Platform Administration",

  // Logo
  logo: {
    main: "/logo-mark.svg",
    light: "/logo-mark.svg",
    dark: "/logo-mark.svg",
    width: 40,
    height: 40,
    icon: "LayoutDashboard",
  },

  // Colors (teal — dental brand)
  colors: {
    primary: {
      50: "#f0fdfa",
      100: "#ccfbf1",
      200: "#99f6e4",
      300: "#5eead4",
      400: "#2dd4bf",
      500: "#14b8a6",
      600: "#0d9488",
      700: "#0f766e",
      800: "#115e59",
      900: "#134e4a",
      950: "#042f2e",
    },
    gradient: "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)",
  },

  // Typography
  typography: {
    fontFamily: "font-sans",
    heading: { size: "text-lg", weight: "font-bold" },
    subheading: { size: "text-sm", weight: "font-medium" },
  },

  // Links
  links: { website: "#", support: "#", documentation: "#" },

  // Copyright
  copyright: {
    year: new Date().getFullYear(),
    text: `© ${new Date().getFullYear()} JDent. All rights reserved.`,
  },
};

export default BRANDING;
