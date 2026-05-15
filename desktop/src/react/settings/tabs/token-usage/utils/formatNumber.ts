/**
 * 格式化数字为紧凑形式
 * 1000 → 1K, 18600 → 18.6K, 1500000 → 1.5M
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return k < 10 ? k.toFixed(1).replace(/.0$/, "") + "K" : Math.round(k) + "K";
  }
  const m = n / 1_000_000;
  return m < 10 ? m.toFixed(1) + "M" : Math.round(m) + "M";
}
