// src/constants/branding.js

/** JGasFlow Console: the platform console for JGasFlow, not for shops. */
export const BRANDING = {
  name: "JGasFlow",
  shortName: "JGasFlow",
  tagline: "Console",
  description: "JGasFlow platform console",

  logo: { main: "/logo-mark.svg", width: 40, height: 40 },

  colors: { navy: "#020033", orange: "#F26B1D" },

  copyright: {
    year: new Date().getFullYear(),
    text: `© ${new Date().getFullYear()} JGasFlow by Jantrah Tech`,
  },
};

export default BRANDING;
