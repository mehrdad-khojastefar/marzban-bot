import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'node:https';

const agent = new SocksProxyAgent('socks5h://127.0.0.1:12334');

const hosts = ['api.telegram.org', 'www.google.com', 'github.com'];

for (const hostname of hosts) {
  await new Promise((resolve) => {
    const req = https.get({ hostname, path: '/', agent }, (res) => {
      console.log(hostname, '→ OK', res.statusCode);
      res.resume();
      resolve();
    });
    req.on('error', (e) => {
      console.log(hostname, '→ ERR', e.code, e.message);
      resolve();
    });
    req.setTimeout(10000, () => {
      console.log(hostname, '→ TIMEOUT');
      req.destroy();
      resolve();
    });
  });
}
