import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'node:https';
import 'dotenv/config';

const agent = new SocksProxyAgent('socks5h://127.0.0.1:12334');
const token = process.env.TELEGRAM_BOT_TOKEN;

async function getUpdates(timeout) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ timeout, offset: 0, allowed_updates: [] });
    const t0 = Date.now();
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/getUpdates`,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const dt = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`timeout=${timeout}s → status ${res.statusCode} after ${dt}s`);
          resolve();
        });
      },
    );
    req.on('error', (e) => {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`timeout=${timeout}s → ERR ${e.code} after ${dt}s — ${e.message}`);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

console.log('Testing Telegram long-polling tolerance through Hiddify...\n');
await getUpdates(0);
await getUpdates(10);
await getUpdates(30);
await getUpdates(50);
