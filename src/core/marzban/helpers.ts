import { getMarzban } from './singleton';
import type { ProxyTypes } from './types';

/**
 * Fetches enabled inbounds from Marzban and builds the proxies + inbounds
 * objects needed for user creation. This ensures users are attached to all
 * active inbounds on the server.
 */
export async function buildProxiesAndInbounds(): Promise<{
  proxies: Record<string, Record<string, unknown>>;
  inbounds: Partial<Record<ProxyTypes, string[]>>;
}> {
  const marzban = getMarzban();
  const serverInbounds = await marzban.getInbounds();

  const proxies: Record<string, Record<string, unknown>> = {};
  const inbounds: Partial<Record<ProxyTypes, string[]>> = {};

  for (const [proto, inboundList] of Object.entries(serverInbounds)) {
    if (inboundList && inboundList.length > 0) {
      proxies[proto] = {};
      inbounds[proto as ProxyTypes] = inboundList.map((ib) => ib.tag);
    }
  }

  return { proxies, inbounds };
}
