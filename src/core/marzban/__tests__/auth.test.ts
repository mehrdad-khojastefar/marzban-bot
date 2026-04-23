import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, runRequestInterceptor, runResponseErrorInterceptor } from './helpers'
import type { InternalAxiosRequestConfig, AxiosError } from 'axios'
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
  const headers = new MockHeaders()
  return {
    url: '/api/admin',
    headers,
    ...overrides,
  } as unknown as InternalAxiosRequestConfig
}

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch token on first authenticated request via interceptor', async () => {
    const { mock } = setupClient()

    const config = makeRequestConfig({ url: '/api/admin' })
    await runRequestInterceptor(mock, config)

    expect(mock.post).toHaveBeenCalledWith(
      '/api/admin/token',
      expect.any(URLSearchParams),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )

    const formData = mock.post.mock.calls[0][1] as URLSearchParams
    expect(formData.get('username')).toBe('admin')
    expect(formData.get('password')).toBe('secret')
    expect(formData.get('grant_type')).toBe('password')
  })

  it('should set Authorization header after authentication', async () => {
    const { mock } = setupClient()

    const config = makeRequestConfig({ url: '/api/admin' })
    const result = await runRequestInterceptor(mock, config)
    const headers = result.headers as unknown as MockHeaders

    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('should cache token across multiple interceptor calls', async () => {
    const { mock } = setupClient()

    const config1 = makeRequestConfig({ url: '/api/admin' })
    await runRequestInterceptor(mock, config1)

    const config2 = makeRequestConfig({ url: '/api/users' })
    await runRequestInterceptor(mock, config2)

    const tokenCalls = mock.post.mock.calls.filter(
      (call) => call[0] === '/api/admin/token',
    )
    expect(tokenCalls).toHaveLength(1)
  })

  it('should skip auth for token endpoint', async () => {
    const { mock } = setupClient()

    const config = makeRequestConfig({ url: '/api/admin/token' })
    const result = await runRequestInterceptor(mock, config)
    const headers = result.headers as unknown as MockHeaders

    expect(headers.has('Authorization')).toBe(false)
    const tokenCalls = mock.post.mock.calls.filter(
      (call) => call[0] === '/api/admin/token',
    )
    expect(tokenCalls).toHaveLength(0)
  })

  it('should skip auth when _skipAuth is set', async () => {
    const { mock } = setupClient()

    const config = makeRequestConfig({ url: '/sub/token123/', _skipAuth: true })
    const result = await runRequestInterceptor(mock, config)
    const headers = result.headers as unknown as MockHeaders

    expect(headers.has('Authorization')).toBe(false)
  })

  it('should deduplicate concurrent token requests', async () => {
    const { mock } = setupClient()

    let resolveToken: ((value: { data: { access_token: string; token_type: string } }) => void) | null = null
    mock.post.mockImplementation((url: string) => {
      if (url === '/api/admin/token') {
        return new Promise((resolve) => {
          resolveToken = resolve
        })
      }
      return Promise.resolve({ data: {} })
    })

    const config1 = makeRequestConfig({ url: '/api/admin' })
    const config2 = makeRequestConfig({ url: '/api/users' })

    const p1 = runRequestInterceptor(mock, config1)
    const p2 = runRequestInterceptor(mock, config2)

    await vi.waitFor(() => {
      expect(resolveToken).not.toBeNull()
    })

    resolveToken!({ data: { access_token: 'dedup-token', token_type: 'bearer' } })

    const [r1, r2] = await Promise.all([p1, p2])
    const h1 = r1.headers as unknown as MockHeaders
    const h2 = r2.headers as unknown as MockHeaders

    expect(h1.get('Authorization')).toBe('Bearer dedup-token')
    expect(h2.get('Authorization')).toBe('Bearer dedup-token')

    const tokenCalls = mock.post.mock.calls.filter(
      (call) => call[0] === '/api/admin/token',
    )
    expect(tokenCalls).toHaveLength(1)
  })

  it('should register request and response interceptors', () => {
    const { mock } = setupClient()

    expect(mock.interceptors.request.use).toHaveBeenCalledTimes(1)
    expect(mock.interceptors.response.use).toHaveBeenCalledTimes(1)
  })

  it('should register response error handler', () => {
    const { mock } = setupClient()

    expect(mock.interceptors.response.handlers).toHaveLength(1)
    expect(mock.interceptors.response.handlers[0].rejected).toBeDefined()
  })

  it('should throw MarzbanError on non-401 errors', async () => {
    const { mock } = setupClient()

    const errorConfig = makeRequestConfig({ url: '/api/user/test' })
    const axiosError = {
      response: { status: 404, data: { detail: 'User not found' } },
      config: errorConfig,
      message: 'Not Found',
      isAxiosError: true,
    } as unknown as AxiosError

    await expect(runResponseErrorInterceptor(mock, axiosError)).rejects.toThrow(MarzbanError)

    try {
      await runResponseErrorInterceptor(mock, axiosError)
    } catch (err) {
      expect(err).toBeInstanceOf(MarzbanError)
      const mErr = err as MarzbanError
      expect(mErr.statusCode).toBe(404)
      expect(mErr.body).toEqual({ detail: 'User not found' })
    }
  })

  it('should throw MarzbanError when no config on error', async () => {
    const { mock } = setupClient()

    const axiosError = {
      response: { status: 500, data: 'Internal Server Error' },
      config: undefined,
      message: 'Server error',
      isAxiosError: true,
    } as unknown as AxiosError

    await expect(runResponseErrorInterceptor(mock, axiosError)).rejects.toThrow(MarzbanError)
  })
})
