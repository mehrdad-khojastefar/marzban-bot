import fs from 'node:fs';
import jwt from 'jsonwebtoken';

let privateKey: string | null = null;
let vendorId: string | null = null;

export function initPremzyJwt(config: { vendorId: string; privateKeyPath: string }): void {
  if (!fs.existsSync(config.privateKeyPath)) {
    throw new Error(`Premzy EC private key not found at ${config.privateKeyPath}. Run: yarn keys:generate`);
  }
  privateKey = fs.readFileSync(config.privateKeyPath, 'utf-8');
  vendorId = config.vendorId;
}

/**
 * Build a Premzy checkout URL for the given toman amount.
 * Signs a JWT with the vendor's EC private key (ES256 / P-256).
 */
export function buildCheckoutUrl(tomanAmount: number, transactionId: string): string {
  if (!privateKey || !vendorId) {
    throw new Error('Premzy JWT not initialized. Call initPremzyJwt() first.');
  }

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      vendor_id: vendorId,
      toman_amount: tomanAmount,
      transaction_id: transactionId,
      iat: now 
    },
    privateKey,
    { algorithm: 'ES256' },
  );

  return `https://premzy.pro/checkout?jwt=${token}`;
}
