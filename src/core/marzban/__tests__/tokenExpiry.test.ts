import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { setupClient, runRequestInterceptor } from './helpers'

class MockHeaders {
  private headers: Record<string, string> = {}
  set(key: string, value: string) {
    this.headers[key] = value
  }
  get(key: string) {
    return this.headers[key] ?? undefined
  }
}

function makeRequestConfig(): InternalAxiosRequestConfig {
  return {
    url: '/api/admin',
    headers: new MockHeaders(),
  } as unknown as InternalAxiosRequestConfig
}

function tokenCalls(mock: ReturnType<typeof setupClient>['mock']): number {
  return mock.post.mock.calls.filter((c) => c[0] === '/api/admin/token').length
}

describe('Proactive token refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should refresh the token after 80% of the default TTL elapses', async () => {
    const { mock } = setupClient()

    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(1)

    // Default TTL is 30 min; 80% = 24 min. Advance 23 min — still fresh.
    vi.setSystemTime(Date.now() + 23 * 60 * 1000)
    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(1)

    // Advance past 80% threshold — should refresh.
    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(2)
  })

  it('should use server-provided expires_in to set TTL', async () => {
    const { mock } = setupClient()
    mock.post.mockImplementation(async (url: string) => {
      if (url === '/api/admin/token') {
        return { data: { access_token: 'short-lived', token_type: 'bearer', expires_in: 60 } }
      }
      return { data: {} }
    })

    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(1)

    // 80% of 60s = 48s. Advance 30s — still fresh.
    vi.setSystemTime(Date.now() + 30 * 1000)
    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(1)

    // Advance past 48s threshold — refresh.
    vi.setSystemTime(Date.now() + 20 * 1000)
    await runRequestInterceptor(mock, makeRequestConfig())
    expect(tokenCalls(mock)).toBe(2)
  })
})
