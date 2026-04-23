import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { NodeCreate, NodeModify, NodeResponse } from '../types'

describe('Node methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockNodeResponse: NodeResponse = {
    name: 'DE node',
    address: '192.168.1.1',
    port: 62050,
    api_port: 62051,
    usage_coefficient: 1.0,
    id: 1,
    xray_version: '1.8.0',
    status: 'connected',
    message: null,
  }

  describe('getNodeSettings', () => {
    it('should GET /api/node/settings', async () => {
      const { client, mock } = setupClient()
      const settings = { min_node_version: 'v0.2.0', certificate: 'cert-data' }
      mock.get.mockResolvedValueOnce(mockResponse(settings))

      const result = await client.getNodeSettings()

      expect(mock.get).toHaveBeenCalledWith('/api/node/settings')
      expect(result).toEqual(settings)
    })
  })

  describe('addNode', () => {
    it('should POST /api/node with data', async () => {
      const { client, mock } = setupClient()
      const data: NodeCreate = { name: 'DE node', address: '192.168.1.1' }
      mock.post.mockImplementation(async (url: string) => {
        if (url === '/api/admin/token') {
          return { data: { access_token: 'test-token', token_type: 'bearer' } }
        }
        return { data: mockNodeResponse }
      })

      const result = await client.addNode(data)

      expect(mock.post).toHaveBeenCalledWith('/api/node', data)
      expect(result).toEqual(mockNodeResponse)
    })
  })

  describe('getNode', () => {
    it('should GET /api/node/:nodeId', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse(mockNodeResponse))

      const result = await client.getNode(1)

      expect(mock.get).toHaveBeenCalledWith('/api/node/1')
      expect(result).toEqual(mockNodeResponse)
    })
  })

  describe('modifyNode', () => {
    it('should PUT /api/node/:nodeId with data', async () => {
      const { client, mock } = setupClient()
      const data: NodeModify = { name: 'Updated node', status: 'disabled' }
      mock.put.mockResolvedValueOnce(mockResponse(mockNodeResponse))

      const result = await client.modifyNode(1, data)

      expect(mock.put).toHaveBeenCalledWith('/api/node/1', data)
      expect(result).toEqual(mockNodeResponse)
    })
  })

  describe('removeNode', () => {
    it('should DELETE /api/node/:nodeId', async () => {
      const { client, mock } = setupClient()

      await client.removeNode(1)

      expect(mock.delete).toHaveBeenCalledWith('/api/node/1')
    })
  })

  describe('getNodes', () => {
    it('should GET /api/nodes', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse([mockNodeResponse]))

      const result = await client.getNodes()

      expect(mock.get).toHaveBeenCalledWith('/api/nodes')
      expect(result).toEqual([mockNodeResponse])
    })
  })

  describe('reconnectNode', () => {
    it('should POST /api/node/:nodeId/reconnect', async () => {
      const { client, mock } = setupClient()

      await client.reconnectNode(1)

      expect(mock.post).toHaveBeenCalledWith('/api/node/1/reconnect')
    })
  })

  describe('getNodesUsage', () => {
    it('should GET /api/nodes/usage with date range', async () => {
      const { client, mock } = setupClient()
      const usageResp = { usages: [{ node_id: 1, node_name: 'DE', uplink: 100, downlink: 200 }] }
      mock.get.mockResolvedValueOnce(mockResponse(usageResp))

      const result = await client.getNodesUsage({ start: '2024-01-01', end: '2024-01-31' })

      expect(mock.get).toHaveBeenCalledWith('/api/nodes/usage', {
        params: { start: '2024-01-01', end: '2024-01-31' },
      })
      expect(result).toEqual(usageResp)
    })

    it('should GET /api/nodes/usage without params', async () => {
      const { client, mock } = setupClient()
      mock.get.mockResolvedValueOnce(mockResponse({ usages: [] }))

      await client.getNodesUsage()

      expect(mock.get).toHaveBeenCalledWith('/api/nodes/usage', { params: undefined })
    })
  })
})
