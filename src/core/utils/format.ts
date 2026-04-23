const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(str: string): string {
  return str.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[parseInt(d)]);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) {
    const gb = (bytes / 1073741824).toFixed(bytes % 1073741824 === 0 ? 0 : 1);
    return toPersianDigits(gb) + ' GB';
  }
  const mb = (bytes / 1048576).toFixed(0);
  return toPersianDigits(mb) + ' MB';
}

export function formatDaysLeft(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return toPersianDigits('0') + ' روز';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return toPersianDigits(String(days)) + ' روز';
}

export function formatPrice(toman: number): string {
  const formatted = toman.toLocaleString('en-US');
  return toPersianDigits(formatted) + ' تومان';
}
