/**
 * Paleta y tokens de diseño de Banco Futura (tema oscuro).
 *
 * Inspirado en el mockup navy del equipo de producto: fondo #0A1221, superficies
 * translúcidas (white/5), acentos azul/esmeralda y tarjetas con gradiente.
 * Centralizado aquí para que todas las pantallas compartan la misma identidad.
 */
export const colors = {
  bg: "#0A1221",
  surface: "rgba(255,255,255,0.05)",
  surfaceStrong: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.08)",

  text: "#FFFFFF",
  textMuted: "#94A3B8", // slate-400
  textFaint: "#64748B", // slate-500

  blue: "#3B82F6",
  blueDeep: "#2563EB",
  emerald: "#10B981",
  red: "#F87171",
  amber: "#FBBF24",
};

/** Gradientes reutilizables para tarjetas (de claro → oscuro). */
export const gradients = {
  checking: ["#2563EB", "#3B82F6"] as const,
  savings: ["#059669", "#10B981"] as const,
  cardDebit: ["#334155", "#0F172A"] as const,
  cardCredit: ["#1D4ED8", "#312E81"] as const,
  cardBlocked: ["#475569", "#1E293B"] as const,
};

export const radius = { sm: 12, md: 16, lg: 20, pill: 999 };
export const space = { xs: 6, sm: 10, md: 16, lg: 20, xl: 24 };
