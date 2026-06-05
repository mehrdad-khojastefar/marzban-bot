import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { setupClient, runResponseErrorInterceptor } from './helpers'
import { MarzbanError } from '../errors'

class MockHeaders {
  private headers: Record<string, string> = {}
  set(key: string, value: string) {
    this.headers[key] = value
  }
  get(key: string) {
    return this.headers[key] ?? undefined
  }
  has(key: string) {
    return key in this.headers
  }
}

function makeRequestConfig(overrides: Record<string, unknown> = {}): InternalAxiosRequestConfig {
  return {
    url: '/api/user/u1',
    headers: new MockHeaders(),
    ...overrides,
  } as unknown as InternalAxiosRequestConfig
}

describe('Transient retry (network / 5xx)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should retry once on 5xx and mark _retriedTransient', async () => {
    const { mock } = setupClient()
    const config = makeRequestConfig({ url: '/api/user/u1' })

    const error = {
      response: { status: 503, data: 'svc down' },
      config,
      message: 'Service Unavailable',
      isAxiosError: true,
    } as unknown as AxiosError

    await runResponseErrorInterceptor(mock, error)

    expect(mock.request).toHaveBeenCalledTimes(1)
    const retried = mock.request.mock.calls[0][0] as InternalAxiosRequestConfig & {
      _retriedTransient: boolean
    }
    expect(retried._retriedTransient).toBe(true)
  })

  it('should retry once on a network error (no response)', async () => {
    const { mock } = setupClient()
    const config = makeRequestConfig({ url: '/api/users' })

    const error = {
      response: undefined,
      config,
      message: 'ECONNREFUSED',
      isAxiosError: true,
    } as unknown as AxiosError

    await runResponseErrorInterceptor(mock, error)

    expect(mock.request).toHaveBeenCalledTimes(1)
    const retried = mock.request.mock.calls[0][0] as InternalAxiosRequestConfig & {
      _retriedTransient: boolean
    }
    expect(retried._retriedTransient).toBe(true)
  })

  it('should NOT retry on 4xx', async () => {
    const { mock } = setupClient()
    const config = makeRequestConfig({ url: '/api/user/missing' })

    const error = {
      response: { status: 404, data: { detail: 'not found' } },
      config,
      message: 'Not Found',
      isAxiosError: true,
    } as unknown as AxiosError

    await expect(runResponseErrorInterceptor(mock, error)).rejects.toThrow(MarzbanError)
    expect(mock.request).not.toHaveBeenCalled()
  })

  it('should NOT retry a second time once _retriedTransient is set', async () => {
    const { mock } = setupClient()
    const config = makeRequestConfig({
      url: '/api/users',
      _retriedTransient: true,
    })

    const error = {
      response: { status: 502, data: 'gateway' },
      config,
      message: 'Bad Gateway',
      isAxiosError: true,
    } as unknown as AxiosError

    await expect(runResponseErrorInterceptor(mock, error)).rejects.toThrow(MarzbanError)
    expect(mock.request).not.toHaveBeenCalled()
  })

  it('should still treat 401 as auth refresh, not transient', async () => {
    const { mock } = setupClient()
    const config = makeRequestConfig({ url: '/api/user/u1' })

    const error = {
      response: { status: 401, data: 'unauthorized' },
      config,
      message: 'Unauthorized',
      isAxiosError: true,
    } as unknown as AxiosError

    await runResponseErrorInterceptor(mock, error)

    expect(mock.request).toHaveBeenCalledTimes(1)
    const retried = mock.request.mock.calls[0][0] as InternalAxiosRequestConfig & {
      _retriedAuth?: boolean
      _retriedTransient?: boolean
    }
    expect(retried._retriedAuth).toBe(true)
    expect(retried._retriedTransient).toBeUndefined()
  })
})
