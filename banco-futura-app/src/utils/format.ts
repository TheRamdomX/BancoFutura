export function formatCLP(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "$0";
  // Formateo manual de miles con punto (es-CL): no dependemos de Intl, que en
  // React Native (Hermes) suele ignorar el locale y omitir los separadores.
  const sign = n < 0 ? "-" : "";
  const entero = Math.round(Math.abs(n)).toString();
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${conPuntos}`;
}
