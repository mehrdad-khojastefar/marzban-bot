const PERSIAN_TO_ENGLISH: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function toEnglishDigits(str: string): string {
  return str.replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_TO_ENGLISH[d] ?? d);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) {
    const gb = (bytes / 1073741824).toFixed(bytes % 1073741824 === 0 ? 0 : 1);
    return gb + ' GB';
  }
  const mb = (bytes / 1048576).toFixed(0);
  return mb + ' MB';
}

export function formatDaysLeft(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return '0 روز';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return String(days) + ' روز';
}

export function formatPrice(toman: number): string {
  const formatted = toman.toLocaleString('en-US');
  return formatted + ' تومان';
}

export function extractSubToken(marzbanSubUrl: string): string {
  const match = marzbanSubUrl.match(/\/sub\/(.+?)\/?\s*$/);
  return match ? match[1] : '';
}

export function buildSubUrl(subBaseUrl: string, marzbanSubPath: string): string {
  const base = subBaseUrl.replace(/\/+$/, '');
  const path = marzbanSubPath.startsWith('/') ? marzbanSubPath : '/' + marzbanSubPath;
  return `${base}${path}`;
}

export async function fetchConfigs(subUrl: string): Promise<string[]> {
  try {
    const res = await fetch(subUrl);
    if (!res.ok) return [];
    const body = await res.text();
    const decoded = Buffer.from(body.trim(), 'base64').toString('utf-8');
    return decoded.split('\n').filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
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
  return '█'.repeat(filled) + '░'.repeat(empty) + ' ' + String(percent) + '%';
}
