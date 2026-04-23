import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import type { AxiosInstance } from 'axios'

vi.mock('axios')

function setupAxiosMock() {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
    defaults: { headers: { common: {} } },
  }
  vi.mocked(axios.create).mockReturnValue(mockInstance as unknown as AxiosInstance)
  return mockInstance
}

describe('Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('should initialize and return client', async () => {
    setupAxiosMock()
    const { initMarzban, getMarzban } = await import('../singleton')

    initMarzban({
      baseUrl: 'https://marzban.example.com',
      username: 'admin',
      password: 'secret',
    })

    const client = getMarzban()
    expect(client).toBeDefined()
  })

  it('should throw on double initialization', async () => {
    setupAxiosMock()
    const { initMarzban } = await import('../singleton')

    const config = {
      baseUrl: 'https://marzban.example.com',
      username: 'admin',
      password: 'secret',
    }

    initMarzban(config)
    expect(() => initMarzban(config)).toThrow('Marzban client already initialized')
  })

  it('should throw when getting client before initialization', async () => {
    const { getMarzban } = await import('../singleton')

    expect(() => getMarzban()).toThrow('Marzban client not initialized. Call initMarzban() first')
  })

  it('should return the same instance on multiple getMarzban calls', async () => {
    setupAxiosMock()
    const { initMarzban, getMarzban } = await import('../singleton')

    initMarzban({
      baseUrl: 'https://marzban.example.com',
      username: 'admin',
      password: 'secret',
    })

    const client1 = getMarzban()
    const client2 = getMarzban()
    expect(client1).toBe(client2)
  })
})
