import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { renameConfigLinks } from '../core/utils/format';

interface SubServerConfig {
  port: number;
  marzbanSubUrl: string;
  defaultLinkPrefix: string;
  databaseUrl: string;
}

export async function startSubServer(config: SubServerConfig): Promise<http.Server> {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const db = new PrismaClient({ adapter });

  const server = http.createServer(async (req, res) => {
    // Only handle GET /sub/*
    if (!req.url || !req.url.startsWith('/sub/') || req.method !== 'GET') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const token = req.url.slice(5).replace(/\/+$/, ''); // strip /sub/ prefix and trailing slash
    if (!token) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    try {
      // 1. Look up the account by sub token to get seller's link_prefix and marzban_username
      const account = await db.account.findFirst({
        where: { marzban_sub_token: token },
        include: { seller: true },
      });

      const linkPrefix = account?.seller?.link_prefix ?? config.defaultLinkPrefix;
      const username = account?.marzban_username ?? '';

      // 2. Fetch the subscription from Marzban's internal sub endpoint
      const marzbanUrl = `${config.marzbanSubUrl}/sub/${token}`;
      const marzbanRes = await fetch(marzbanUrl, {
        headers: {
          'User-Agent': req.headers['user-agent'] ?? 'DovesSub/1.0',
        },
      });

      if (!marzbanRes.ok) {
        res.writeHead(marzbanRes.status);
        res.end(await marzbanRes.text());
        return;
      }

      const body = await marzbanRes.text();

      // 3. Decode base64, rename configs, re-encode
      const decoded = Buffer.from(body.trim(), 'base64').toString('utf-8');
      const links = decoded.split('\n').filter((l) => l.trim().length > 0);

      const renamed = username
        ? renameConfigLinks(links, linkPrefix, username)
        : links;

      const reEncoded = Buffer.from(renamed.join('\n')).toString('base64');

      // 4. Forward relevant headers from Marzban
      const contentDisposition = marzbanRes.headers.get('content-disposition');
      const profileTitle = marzbanRes.headers.get('profile-title');
      const subUserinfo = marzbanRes.headers.get('subscription-userinfo');
      const profileUpdateInterval = marzbanRes.headers.get('profile-update-interval');

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(contentDisposition && { 'Content-Disposition': contentDisposition }),
        ...(profileTitle && { 'Profile-Title': profileTitle }),
        ...(subUserinfo && { 'Subscription-Userinfo': subUserinfo }),
        ...(profileUpdateInterval && { 'Profile-Update-Interval': profileUpdateInterval }),
      });
      res.end(reEncoded);
    } catch (err) {
      console.error('Sub proxy error:', err);
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(`Sub proxy server running on port ${config.port}`);
      resolve(server);
    });
  });
}
