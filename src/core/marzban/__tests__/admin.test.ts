import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { Admin, AdminCreate, AdminModify } from '../types'

describe('Admin methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockAdmin: Admin = {
    username: 'admin',
    is_sudo: true,
    telegram_id: 12345,
    discord_webhook: null,
    users_usage: 1024,
  }

  describe('getAdmin', () => {
    it('should GET /api/admin', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(mockAdmin))

      const result = await client.getAdmin()

      expect(mock.get).toHaveBeenCalledWith('/api/admin')
      expect(result).toEqual(mockAdmin)
    })
  })

  describe('createAdmin', () => {
    it('should POST /api/admin with data', async () => {
      const { client, mock } = setupClient()
      const data: AdminCreate = {
        username: 'newadmin',
        is_sudo: false,
        password: 'pass123',
      }
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockAdmin }
      })

      const result = await client.createAdmin(data)

      expect(mock.post).toHaveBeenCalledWith('/api/admin', data)
      expect(result).toEqual(mockAdmin)
    })
  })

  describe('modifyAdmin', () => {
    it('should PUT /api/admin/:username with data', async () => {
      const { client, mock } = setupClient()
      const data: AdminModify = { is_sudo: false, telegram_id: 999 }
      mock.put.mockResolvedValueOnce(mockResponse(mockAdmin))

      const result = await client.modifyAdmin('admin', data)

      expect(mock.put).toHaveBeenCalledWith('/api/admin/admin', data)
      expect(result).toEqual(mockAdmin)
    })
  })

  describe('removeAdmin', () => {
    it('should DELETE /api/admin/:username', async () => {
      const { client, mock } = setupClient()
      mock.delete.mockResolvedValueOnce(mockResponse({}))

      await client.removeAdmin('oldadmin')

      expect(mock.delete).toHaveBeenCalledWith('/api/admin/oldadmin')
    })
  })

  describe('getAdmins', () => {
    it('should GET /api/admins with params', async () => {
      const { client, mock } = setupClient()
      const admins = [mockAdmin]
      mock.get.mockResolvedValueOnce(mockResponse(admins))

      const result = await client.getAdmins({ offset: 0, limit: 10, username: 'admin' })

      expect(mock.get).toHaveBeenCalledWith('/api/admins', {
        params: { offset: 0, limit: 10, username: 'admin' },
      })
      expect(result).toEqual(admins)
    })

    it('should GET /api/admins without params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse([]))

      await client.getAdmins()

      expect(mock.get).toHaveBeenCalledWith('/api/admins', { params: undefined })
    })
  })

  describe('disableAdminUsers', () => {
    it('should POST /api/admin/:username/users/disable', async () => {
      const { client, mock } = setupClient()

      await client.disableAdminUsers('admin')

      expect(mock.post).toHaveBeenCalledWith('/api/admin/admin/users/disable')
    })
  })

  describe('activateAdminUsers', () => {
    it('should POST /api/admin/:username/users/activate', async () => {
      const { client, mock } = setupClient()

      await client.activateAdminUsers('admin')

      expect(mock.post).toHaveBeenCalledWith('/api/admin/admin/users/activate')
    })
  })

  describe('resetAdminUsage', () => {
    it('should POST /api/admin/usage/reset/:username', async () => {
      const { client, mock } = setupClient()
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockAdmin }
      })

      const result = await client.resetAdminUsage('admin')

      expect(mock.post).toHaveBeenCalledWith('/api/admin/usage/reset/admin')
      expect(result).toEqual(mockAdmin)
    })
  })

  describe('getAdminUsage', () => {
    it('should GET /api/admin/usage/:username', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(2048))

      const result = await client.getAdminUsage('admin')

      expect(mock.get).toHaveBeenCalledWith('/api/admin/usage/admin')
      expect(result).toBe(2048)
    })
  })
})
