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

export function buildSubUrl(subBaseUrl: string, proxies: Record<string, unknown>, username: string): string {
  // Extract UUID from the first available proxy (e.g. proxies.vmess.id)
  let uuid = '';
  for (const proto of Object.values(proxies)) {
    if (proto && typeof proto === 'object' && 'id' in proto) {
      uuid = String((proto as Record<string, unknown>).id);
      break;
    }
  }
  const base = subBaseUrl.replace(/\/+$/, '');
  return `${base}/sub/${uuid}/${username}/`;
}

export function renameConfigLinks(links: string[], prefix: string, username: string): string[] {
  const displayName = `${prefix}${username}`;
  return links.map((link) => {
    // vmess:// → base64 JSON with "ps" field
    if (link.startsWith('vmess://')) {
      try {
        const b64 = link.slice(8);
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
        json.ps = displayName;
        return 'vmess://' + Buffer.from(JSON.stringify(json)).toString('base64');
      } catch {
        return link;
      }
    }

    // vless://, trojan://, ss:// → #fragment is the name
    const fragmentProtos = ['vless://', 'trojan://', 'ss://'];
    for (const proto of fragmentProtos) {
      if (link.startsWith(proto)) {
        const hashIdx = link.indexOf('#');
        const base = hashIdx >= 0 ? link.slice(0, hashIdx) : link;
        return base + '#' + encodeURIComponent(displayName);
      }
    }

    return link;
  });
}

export function formatPercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

export function formatProgressBar(percent: number, width: number = 14): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ' ' + toPersianDigits(String(percent)) + '٪';
}
