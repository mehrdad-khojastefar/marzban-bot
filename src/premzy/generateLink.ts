import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { initPremzyJwt, buildCheckoutUrl } from './jwt';

const AMOUNT_TOMAN = 300_000;

dotenv.config();

const vendorId = process.env.PREMZY_VENDOR_ID;
const keyPath = process.env.PREMZY_EC_PRIVATE_KEY_PATH;

if (!vendorId) {
  console.error('Missing PREMZY_VENDOR_ID in environment');
  process.exit(1);
}
if (!keyPath) {
  console.error('Missing PREMZY_EC_PRIVATE_KEY_PATH in environment');
  process.exit(1);
}

initPremzyJwt({ vendorId, privateKeyPath: keyPath });

const transactionId = crypto.randomUUID();
const url = buildCheckoutUrl(AMOUNT_TOMAN, transactionId);

console.log(url);
