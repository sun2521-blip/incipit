/** 950 -> "950", 1234 -> "1.2k", 128000 -> "128k", 2500000 -> "2.5M". */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);

  const [divisor, suffix] = value < 1_000_000 ? [1000, "k"] : [1_000_000, "M"];
  const scaled = value / divisor;

  // One decimal below 10 ("1.2k"), none above ("128k"); never "1.0k".
  const text = scaled < 10 ? scaled.toFixed(1) : Math.round(scaled).toString();
  return `${text.replace(/\.0$/, "")}${suffix}`;
}
