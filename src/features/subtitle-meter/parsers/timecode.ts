export function parseTimestamp(value: string): number {
  const trimmed = value.trim();
  const match =
    trimmed.match(/^(\d{1,}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/) ??
    trimmed.match(/^(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) throw new Error(`无法解析时间码「${value}」`);

  const hasHours = match.length === 5;
  const hours = Number(hasHours ? match[1] : 0),
    minutes = Number(match[hasHours ? 2 : 1]),
    seconds = Number(match[hasHours ? 3 : 2]),
    fraction = match[hasHours ? 4 : 3];
  if (minutes > 59 || seconds > 59)
    throw new Error(`时间码超出范围「${value}」`);
  return (
    ((hours * 60 + minutes) * 60 + seconds) * 1000 +
    Number(fraction.padEnd(3, "0"))
  );
}
export function formatTimestamp(ms: number, format: "srt" | "vtt"): string {
  const safe = Math.max(0, Math.trunc(ms));
  const h = Math.floor(safe / 3600000),
    m = Math.floor(safe / 60000) % 60,
    s = Math.floor(safe / 1000) % 60,
    milli = safe % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${format === "srt" ? "," : "."}${String(milli).padStart(3, "0")}`;
}
