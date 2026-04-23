import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { UserCreate, UserModify, UserResponse, UsersResponse } from '../types'

describe('User methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockUserResponse: UserResponse = {
    proxies: {},
    expire: 0,
    data_limit: 1073741824,
    data_limit_reset_strategy: 'no_reset',
    inbounds: {},
    note: null,
    sub_updated_at: null,
    sub_last_user_agent: null,
    online_at: null,
    on_hold_expire_duration: null,
    on_hold_timeout: null,
    auto_delete_in_days: null,
    next_plan: null,
    username: 'testuser',
    status: 'active',
    used_traffic: 0,
    lifetime_used_traffic: 0,
    created_at: '2024-01-01T00:00:00',
    links: [],
    subscription_url: '',
    excluded_inbounds: {},
    admin: null,
  }

  describe('addUser', () => {
    it('should POST /api/user with data', async () => {
      const { client, mock } = setupClient()
      const data: UserCreate = { username: 'testuser', status: 'active' }
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockUserResponse }
      })

      const result = await client.addUser(data)

      expect(mock.post).toHaveBeenCalledWith('/api/user', data)
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('getUser', () => {
    it('should GET /api/user/:username', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(mockUserResponse))

      const result = await client.getUser('testuser')

      expect(mock.get).toHaveBeenCalledWith('/api/user/testuser')
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('modifyUser', () => {
    it('should PUT /api/user/:username with data', async () => {
      const { client, mock } = setupClient()
      const data: UserModify = { status: 'disabled' }
      mock.put.mockResolvedValueOnce(mockResponse(mockUserResponse))

      const result = await client.modifyUser('testuser', data)

      expect(mock.put).toHaveBeenCalledWith('/api/user/testuser', data)
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('removeUser', () => {
    it('should DELETE /api/user/:username', async () => {
      const { client, mock } = setupClient()

      await client.removeUser('testuser')

      expect(mock.delete).toHaveBeenCalledWith('/api/user/testuser')
    })
  })

  describe('resetUserDataUsage', () => {
    it('should POST /api/user/:username/reset', async () => {
      const { client, mock } = setupClient()
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockUserResponse }
      })

      const result = await client.resetUserDataUsage('testuser')

      expect(mock.post).toHaveBeenCalledWith('/api/user/testuser/reset')
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('revokeUserSubscription', () => {
    it('should POST /api/user/:username/revoke_sub', async () => {
      const { client, mock } = setupClient()
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockUserResponse }
      })

      const result = await client.revokeUserSubscription('testuser')

      expect(mock.post).toHaveBeenCalledWith('/api/user/testuser/revoke_sub')
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('getUsers', () => {
    it('should GET /api/users with params', async () => {
      const { client, mock } = setupClient()
      const usersResp: UsersResponse = { users: [mockUserResponse], total: 1 }
      mock.get.mockResolvedValueOnce(mockResponse(usersResp))

      const result = await client.getUsers({
        offset: 0,
        limit: 10,
        status: 'active',
        username: ['user1', 'user2'],
        sort: '-created_at',
      })

      expect(mock.get).toHaveBeenCalledWith('/api/users', {
        params: {
          offset: 0,
          limit: 10,
          status: 'active',
          username: ['user1', 'user2'],
          sort: '-created_at',
        },
      })
      expect(result).toEqual(usersResp)
    })

    it('should GET /api/users without params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse({ users: [], total: 0 }))

      await client.getUsers()

      expect(mock.get).toHaveBeenCalledWith('/api/users', { params: undefined })
    })
  })

  describe('resetUsersDataUsage', () => {
    it('should POST /api/users/reset', async () => {
      const { client, mock } = setupClient()

      await client.resetUsersDataUsage()

      expect(mock.post).toHaveBeenCalledWith('/api/users/reset')
    })
  })

  describe('getUserUsage', () => {
    it('should GET /api/user/:username/usage with date range', async () => {
      const { client, mock } = setupClient()
      const usageResp = { username: 'testuser', usages: [] }
      mock.get.mockResolvedValueOnce(mockResponse(usageResp))

      const result = await client.getUserUsage('testuser', {
        start: '2024-01-01',
        end: '2024-01-31',
      })

      expect(mock.get).toHaveBeenCalledWith('/api/user/testuser/usage', {
        params: { start: '2024-01-01', end: '2024-01-31' },
      })
      expect(result).toEqual(usageResp)
    })
  })

  describe('activeNextPlan', () => {
    it('should POST /api/user/:username/active-next', async () => {
      const { client, mock } = setupClient()
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockUserResponse }
      })

      const result = await client.activeNextPlan('testuser')

      expect(mock.post).toHaveBeenCalledWith('/api/user/testuser/active-next')
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('getUsersUsage', () => {
    it('should GET /api/users/usage with params', async () => {
      const { client, mock } = setupClient()
      const usageResp = { usages: [] }
      mock.get.mockResolvedValueOnce(mockResponse(usageResp))

      const result = await client.getUsersUsage({
        start: '2024-01-01',
        end: '2024-01-31',
        admin: ['admin1'],
      })

      expect(mock.get).toHaveBeenCalledWith('/api/users/usage', {
        params: { start: '2024-01-01', end: '2024-01-31', admin: ['admin1'] },
      })
      expect(result).toEqual(usageResp)
    })
  })

  describe('setUserOwner', () => {
    it('should PUT /api/user/:username/set-owner with admin_username query', async () => {
      const { client, mock } = setupClient()
      mock.put.mockResolvedValueOnce(mockResponse(mockUserResponse))

      const result = await client.setUserOwner('testuser', 'newadmin')

      expect(mock.put).toHaveBeenCalledWith('/api/user/testuser/set-owner', null, {
        params: { admin_username: 'newadmin' },
      })
      expect(result).toEqual(mockUserResponse)
    })
  })

  describe('getExpiredUsers', () => {
    it('should GET /api/users/expired with params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(['user1', 'user2']))

      const result = await client.getExpiredUsers({
        expired_after: '2024-01-01T00:00:00',
        expired_before: '2024-01-31T23:59:59',
      })

      expect(mock.get).toHaveBeenCalledWith('/api/users/expired', {
        params: {
          expired_after: '2024-01-01T00:00:00',
          expired_before: '2024-01-31T23:59:59',
        },
      })
      expect(result).toEqual(['user1', 'user2'])
    })
  })

  describe('deleteExpiredUsers', () => {
    it('should DELETE /api/users/expired with params', async () => {
      const { client, mock } = setupClient()
      mock.delete.mockResolvedValueOnce(mockResponse(['user1']))

      const result = await client.deleteExpiredUsers({
        expired_before: '2024-01-31T23:59:59',
      })

      expect(mock.delete).toHaveBeenCalledWith('/api/users/expired', {
        params: { expired_before: '2024-01-31T23:59:59' },
      })
      expect(result).toEqual(['user1'])
    })
  })
})
