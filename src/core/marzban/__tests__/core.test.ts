import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { CoreStats } from '../types'

describe('Core methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCoreStats', () => {
    it('should GET /api/core', async () => {
      const { client, mock } = setupClient()
      const stats: CoreStats = {
        version: '1.8.0',
        started: true,
        logs_websocket: 'ws://localhost/logs',
      }
      mock.get.mockResolvedValueOnce(mockResponse(stats))

      const result = await client.getCoreStats()

      expect(mock.get).toHaveBeenCalledWith('/api/core')
      expect(result).toEqual(stats)
    })
  })

  describe('restartCore', () => {
    it('should POST /api/core/restart', async () => {
      const { client, mock } = setupClient()

      await client.restartCore()

      expect(mock.post).toHaveBeenCalledWith('/api/core/restart')
    })
  })

  describe('getCoreConfig', () => {
    it('should GET /api/core/config', async () => {
      const { client, mock } = setupClient()
      const config = { log: { loglevel: 'warning' } }
      mock.get.mockResolvedValueOnce(mockResponse(config))

      const result = await client.getCoreConfig()

      expect(mock.get).toHaveBeenCalledWith('/api/core/config')
      expect(result).toEqual(config)
    })
  })

  describe('modifyCoreConfig', () => {
    it('should PUT /api/core/config with data', async () => {
      const { client, mock } = setupClient()
      const config = { log: { loglevel: 'info' } }
      mock.put.mockResolvedValueOnce(mockResponse(config))

      const result = await client.modifyCoreConfig(config)

      expect(mock.put).toHaveBeenCalledWith('/api/core/config', config)
      expect(result).toEqual(config)
    })
  })
})
