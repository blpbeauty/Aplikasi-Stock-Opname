/**
 * Parser & formatter waktu Indonesia — dipakai bersama Scan, History,
 * dan Profile. Timestamp dari Google Sheets bisa berformat ISO maupun
 * "DD MMM YYYY HH:mm" (nama bulan Indonesia/Inggris).
 */

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, May: 4, Jun: 5, Jul: 6,
  Agu: 7, Aug: 7, Sep: 8, Okt: 9, Oct: 9, Nov: 10, Des: 11, Dec: 11,
};

/** Parse timestamp GAS (ISO atau "4 Agu 2026 10:42") menjadi Date, atau null. */
export function parseTimestamp(raw: string): Date | null {
  try {
    if (!raw) return null;
    if (/\d{4}-\d{2}-\d{2}T/.test(raw)) {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    // "4 Agu 2026 10:42" — dengan atau tanpa jam
    const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const d = new Date(+m[3], MONTHS[m[2]] ?? 0, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** "Baru saja", "5 mnt lalu", "3 jam lalu", "2 hari lalu", atau tanggal singkat. */
export function formatRelativeTime(raw: string): string {
  const date = parseTimestamp(raw);
  if (!date) return raw;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "Baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** "4 Agu, 10:42" — untuk baris riwayat. */
export function formatDisplayTime(raw: string): string {
  const d = parseTimestamp(raw);
  if (!d) return raw;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Jam singkat "10:42" untuk baris "terakhir dikerjakan". */
export function formatClockTime(raw: string): string {
  const d = parseTimestamp(raw);
  if (!d) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** ISO tanggal lokal "2026-09-04". */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
