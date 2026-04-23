import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupClient, mockResponse } from './helpers'
import type { SystemStats, ProxyHost } from '../types'

describe('System methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSystemStats', () => {
    it('should GET /api/system', async () => {
      const { client, mock } = setupClient()
      const stats: SystemStats = {
        version: '0.8.4',
        mem_total: 8192,
        mem_used: 4096,
        cpu_cores: 4,
        cpu_usage: 25.5,
        total_user: 100,
        online_users: 10,
        users_active: 80,
        users_on_hold: 5,
        users_disabled: 3,
        users_expired: 10,
        users_limited: 2,
        incoming_bandwidth: 1024000,
        outgoing_bandwidth: 2048000,
        incoming_bandwidth_speed: 1024,
        outgoing_bandwidth_speed: 2048,
      }
      mock.get.mockResolvedValueOnce(mockResponse(stats))

      const result = await client.getSystemStats()

      expect(mock.get).toHaveBeenCalledWith('/api/system')
      expect(result).toEqual(stats)
    })
  })

  describe('getInbounds', () => {
    it('should GET /api/inbounds', async () => {
      const { client, mock } = setupClient()
      const inbounds = {
        vmess: [{ tag: 'VMess TCP', protocol: 'vmess', network: 'tcp', tls: 'none', port: 443 }],
      }
      mock.get.mockResolvedValueOnce(mockResponse(inbounds))

      const result = await client.getInbounds()

      expect(mock.get).toHaveBeenCalledWith('/api/inbounds')
      expect(result).toEqual(inbounds)
    })
  })

  describe('getHosts', () => {
    it('should GET /api/hosts', async () => {
      const { client, mock } = setupClient()
      const hosts = {
        'VMess TCP': [{ remark: 'Main', address: 'example.com' }],
      }
      mock.get.mockResolvedValueOnce(mockResponse(hosts))

      const result = await client.getHosts()

      expect(mock.get).toHaveBeenCalledWith('/api/hosts')
      expect(result).toEqual(hosts)
    })
  })

  describe('modifyHosts', () => {
    it('should PUT /api/hosts with data', async () => {
      const { client, mock } = setupClient()
      const hosts: Record<string, ProxyHost[]> = {
        'VMess TCP': [{ remark: 'Updated', address: 'new.example.com' }],
      }
      mock.put.mockResolvedValueOnce(mockResponse(hosts))

      const result = await client.modifyHosts(hosts)

      expect(mock.put).toHaveBeenCalledWith('/api/hosts', hosts)
      expect(result).toEqual(hosts)
    })
  })
})
