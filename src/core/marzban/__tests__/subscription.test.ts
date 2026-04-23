import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { SubscriptionUserResponse } from '../types'

describe('Subscription methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSubUser: SubscriptionUserResponse = {
    proxies: {},
    expire: null,
    data_limit: null,
    data_limit_reset_strategy: 'no_reset',
    sub_updated_at: null,
    sub_last_user_agent: null,
    online_at: null,
    on_hold_expire_duration: null,
    on_hold_timeout: null,
    next_plan: null,
    username: 'testuser',
    status: 'active',
    used_traffic: 0,
    lifetime_used_traffic: 0,
    created_at: '2024-01-01T00:00:00',
    links: ['vmess://...'],
    subscription_url: 'https://example.com/sub/token123/',
  }

  describe('getUserSubscription', () => {
    it('should GET /sub/:token/ without auth', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse('subscription-data'))

      const result = await client.getUserSubscription('token123')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/', expect.objectContaining({
        headers: {},
        _skipAuth: true,
      }))
      expect(result).toBe('subscription-data')
    })

    it('should pass User-Agent header when provided', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse('subscription-data'))

      await client.getUserSubscription('token123', 'ClashForAndroid/2.5')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/', expect.objectContaining({
        headers: { 'User-Agent': 'ClashForAndroid/2.5' },
        _skipAuth: true,
      }))
    })

    it('should not include Authorization header', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse('data'))

      await client.getUserSubscription('token123')

      const callConfig = mock.get.mock.calls[0][1]
      expect(callConfig._skipAuth).toBe(true)
    })
  })

  describe('getUserSubscriptionInfo', () => {
    it('should GET /sub/:token/info without auth', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(mockSubUser))

      const result = await client.getUserSubscriptionInfo('token123')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/info', expect.objectContaining({
        _skipAuth: true,
      }))
      expect(result).toEqual(mockSubUser)
    })
  })

  describe('getUserSubscriptionUsage', () => {
    it('should GET /sub/:token/usage without auth', async () => {
      const { client, mock } = setupClient()
      const usageData = { usages: [] }
      mock.get.mockResolvedValueOnce(mockResponse(usageData))

      const result = await client.getUserSubscriptionUsage('token123', {
        start: '2024-01-01',
        end: '2024-01-31',
      })

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/usage', expect.objectContaining({
        params: { start: '2024-01-01', end: '2024-01-31' },
        _skipAuth: true,
      }))
      expect(result).toEqual(usageData)
    })

    it('should GET /sub/:token/usage without params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse({}))

      await client.getUserSubscriptionUsage('token123')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/usage', expect.objectContaining({
        params: undefined,
        _skipAuth: true,
      }))
    })
  })

  describe('getUserSubscriptionByClient', () => {
    it('should GET /sub/:token/:clientType without auth', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse('clash-config'))

      const result = await client.getUserSubscriptionByClient('token123', 'clash-meta')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/clash-meta', expect.objectContaining({
        headers: {},
        _skipAuth: true,
      }))
      expect(result).toBe('clash-config')
    })

    it('should pass User-Agent header when provided', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse('config'))

      await client.getUserSubscriptionByClient('token123', 'v2ray', 'V2RayNG/1.0')

      expect(mock.get).toHaveBeenCalledWith('/sub/token123/v2ray', expect.objectContaining({
        headers: { 'User-Agent': 'V2RayNG/1.0' },
        _skipAuth: true,
      }))
    })
  })
})
