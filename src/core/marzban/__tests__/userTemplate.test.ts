import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { UserTemplateCreate, UserTemplateModify, UserTemplateResponse } from '../types'

describe('User Template methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockTemplate: UserTemplateResponse = {
    id: 1,
    name: 'Basic Plan',
    data_limit: 1073741824,
    expire_duration: 2592000,
    username_prefix: null,
    username_suffix: null,
    inbounds: { vmess: ['VMess TCP'] },
  }

  describe('addUserTemplate', () => {
    it('should POST /api/user_template with data', async () => {
      const { client, mock } = setupClient()
      const data: UserTemplateCreate = {
        name: 'Basic Plan',
        data_limit: 1073741824,
        expire_duration: 2592000,
        inbounds: { vmess: ['VMess TCP'] },
      }
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockTemplate }
      })

      const result = await client.addUserTemplate(data)

      expect(mock.post).toHaveBeenCalledWith('/api/user_template', data)
      expect(result).toEqual(mockTemplate)
    })
  })

  describe('getUserTemplates', () => {
    it('should GET /api/user_template with pagination', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse([mockTemplate]))

      const result = await client.getUserTemplates({ offset: 0, limit: 10 })

      expect(mock.get).toHaveBeenCalledWith('/api/user_template', {
        params: { offset: 0, limit: 10 },
      })
      expect(result).toEqual([mockTemplate])
    })

    it('should GET /api/user_template without params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse([]))

      await client.getUserTemplates()

      expect(mock.get).toHaveBeenCalledWith('/api/user_template', { params: undefined })
    })
  })

  describe('getUserTemplate', () => {
    it('should GET /api/user_template/:templateId', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(mockTemplate))

      const result = await client.getUserTemplate(1)

      expect(mock.get).toHaveBeenCalledWith('/api/user_template/1')
      expect(result).toEqual(mockTemplate)
    })
  })

  describe('modifyUserTemplate', () => {
    it('should PUT /api/user_template/:templateId with data', async () => {
      const { client, mock } = setupClient()
      const data: UserTemplateModify = { name: 'Updated Plan', data_limit: 2147483648 }
      mock.put.mockResolvedValueOnce(mockResponse(mockTemplate))

      const result = await client.modifyUserTemplate(1, data)

      expect(mock.put).toHaveBeenCalledWith('/api/user_template/1', data)
      expect(result).toEqual(mockTemplate)
    })
  })

  describe('removeUserTemplate', () => {
    it('should DELETE /api/user_template/:templateId', async () => {
      const { client, mock } = setupClient()

      await client.removeUserTemplate(1)

      expect(mock.delete).toHaveBeenCalledWith('/api/user_template/1')
    })
  })
})
