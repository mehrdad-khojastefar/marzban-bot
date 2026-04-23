import { vi, type Mock } from 'vitest'
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'

vi.mock('axios')

import { MarzbanClient } from '../client'
import type { MarzbanClientConfig } from '../types'

export const TEST_CONFIG: MarzbanClientConfig = {
  baseUrl: 'https://marzban.example.com',
  username: 'admin',
  password: 'secret',
}

type InterceptorFulfilled = (config: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig
type InterceptorRejected = (error: AxiosError) => Promise<unknown>

export interface MockAxiosInstance {
  get: Mock
  post: Mock
  put: Mock
  delete: Mock
  request: Mock
  interceptors: {
    request: {
      use: Mock
      handlers: Array<{ fulfilled: InterceptorFulfilled }>
    }
    response: {
      use: Mock
      handlers: Array<{ fulfilled: (r: unknown) => unknown; rejected: InterceptorRejected }>
    }
  }
  defaults: { headers: { common: Record<string, string> } }
}

export function createMockAxiosInstance(): MockAxiosInstance {
  const instance: MockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
        handlers: [],
      },
      response: {
        use: vi.fn(),
        handlers: [],
      },
    },
    defaults: { headers: { common: {} } },
  }

  instance.interceptors.request.use.mockImplementation((fulfilled: InterceptorFulfilled) => {
    instance.interceptors.request.handlers.push({ fulfilled })
    return 0
  })

  instance.interceptors.response.use.mockImplementation(
    (fulfilled: (r: unknown) => unknown, rejected: InterceptorRejected) => {
      instance.interceptors.response.handlers.push({ fulfilled, rejected })
      return 0
    },
  )

  return instance
}

export function setupClient(): { client: MarzbanClient; mock: MockAxiosInstance } {
  const mock = createMockAxiosInstance()
  const mockedCreate = vi.mocked(axios.create)
  mockedCreate.mockReturnValue(mock as unknown as AxiosInstance)

  mock.post.mockImplementation(async (url: string, _data?: unknown, _config?: unknown) => {
    if (url === '/api/admin/token') {
      return { data: { access_token: 'test-token', token_type: 'bearer' } }
    }
    return { data: {} }
  })

  mock.get.mockResolvedValue({ data: {} })
  mock.put.mockResolvedValue({ data: {} })
  mock.delete.mockResolvedValue({ data: {} })

  const client = new MarzbanClient(TEST_CONFIG)
  return { client, mock }
}

export async function runRequestInterceptor(
  mock: MockAxiosInstance,
  config: InternalAxiosRequestConfig,
): Promise<InternalAxiosRequestConfig> {
  let result = config
  for (const handler of mock.interceptors.request.handlers) {
    result = await handler.fulfilled(result)
  }
  return result
}

export async function runResponseErrorInterceptor(
  mock: MockAxiosInstance,
  error: AxiosError,
): Promise<unknown> {
  for (const handler of mock.interceptors.response.handlers) {
    return handler.rejected(error)
  }
  throw error
}

export function mockResponse<T>(data: T) {
  return Promise.resolve({ data })
}
