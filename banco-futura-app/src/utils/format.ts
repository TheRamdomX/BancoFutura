export function formatCLP(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "$0";
  return "$" + n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}
