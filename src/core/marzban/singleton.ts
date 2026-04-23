import { MarzbanClient } from './client'
import type { MarzbanClientConfig } from './types'

let instance: MarzbanClient | null = null

export function initMarzban(config: MarzbanClientConfig): void {
  if (instance) throw new Error('Marzban client already initialized')
  instance = new MarzbanClient(config)
}

export function getMarzban(): MarzbanClient {
  if (!instance) throw new Error('Marzban client not initialized. Call initMarzban() first')
  return instance
}
