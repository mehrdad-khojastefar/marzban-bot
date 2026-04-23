import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'
import { MarzbanError } from './errors'
import type {
  MarzbanClientConfig,
  Token,
  Admin,
  AdminCreate,
  AdminModify,
  GetAdminsParams,
  UserCreate,
  UserModify,
  UserResponse,
  UsersResponse,
  GetUsersParams,
  DateRangeParams,
  GetUsersUsageParams,
  ExpiredUsersParams,
  UserUsagesResponse,
  UsersUsagesResponse,
  UserTemplateCreate,
  UserTemplateModify,
  UserTemplateResponse,
  PaginationParams,
  NodeCreate,
  NodeModify,
  NodeResponse,
  NodeSettings,
  NodesUsageResponse,
  SystemStats,
  CoreStats,
  ProxyInbound,
  ProxyHost,
  ProxyTypes,
  SubscriptionClientType,
  SubscriptionUserResponse,
} from './types'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
  _skipAuth?: boolean
}

export class MarzbanClient {
  private readonly http: AxiosInstance
  private token: string | null = null
  private tokenFetchPromise: Promise<string> | null = null
  private readonly config: MarzbanClientConfig

  constructor(config: MarzbanClientConfig) {
    this.config = config
    this.http = axios.create({
      baseURL: config.baseUrl,
      paramsSerializer: (params) => {
        const searchParams = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) continue
          if (Array.isArray(value)) {
            for (const item of value) {
              searchParams.append(key, String(item))
            }
          } else {
            searchParams.append(key, String(value))
          }
        }
        return searchParams.toString()
      },
    })

    this.http.interceptors.request.use(async (reqConfig: RetryableConfig) => {
      if (reqConfig._skipAuth) return reqConfig
      if (reqConfig.url === '/api/admin/token') return reqConfig

      const accessToken = await this.ensureToken()
      reqConfig.headers.set('Authorization', `Bearer ${accessToken}`)
      return reqConfig
    })

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableConfig | undefined
        if (!originalRequest) {
          throw new MarzbanError(
            error.message || 'Request failed',
            0,
          )
        }

        if (
          error.response?.status === 401 &&
          !originalRequest._retried &&
          !originalRequest._skipAuth &&
          originalRequest.url !== '/api/admin/token'
        ) {
          originalRequest._retried = true
          this.token = null
          this.tokenFetchPromise = null
          const newToken = await this.ensureToken()
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`)
          return this.http(originalRequest)
        }

        const statusCode = error.response?.status ?? 0
        const body = error.response?.data
        throw new MarzbanError(
          error.message || `Request failed with status ${statusCode}`,
          statusCode,
          body,
        )
      },
    )
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token

    if (this.tokenFetchPromise) return this.tokenFetchPromise

    this.tokenFetchPromise = this.authenticate()
    try {
      const token = await this.tokenFetchPromise
      this.token = token
      return token
    } finally {
      this.tokenFetchPromise = null
    }
  }

  private async authenticate(): Promise<string> {
    const params = new URLSearchParams()
    params.append('username', this.config.username)
    params.append('password', this.config.password)
    params.append('grant_type', 'password')

    const response = await this.http.post<Token>('/api/admin/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data.access_token
  }

  // Admin methods

  async getAdmin(): Promise<Admin> {
    const response = await this.http.get<Admin>('/api/admin')
    return response.data
  }

  async createAdmin(data: AdminCreate): Promise<Admin> {
    const response = await this.http.post<Admin>('/api/admin', data)
    return response.data
  }

  async modifyAdmin(username: string, data: AdminModify): Promise<Admin> {
    const response = await this.http.put<Admin>(`/api/admin/${username}`, data)
    return response.data
  }

  async removeAdmin(username: string): Promise<void> {
    await this.http.delete(`/api/admin/${username}`)
  }

  async getAdmins(params?: GetAdminsParams): Promise<Admin[]> {
    const response = await this.http.get<Admin[]>('/api/admins', { params })
    return response.data
  }

  async disableAdminUsers(username: string): Promise<void> {
    await this.http.post(`/api/admin/${username}/users/disable`)
  }

  async activateAdminUsers(username: string): Promise<void> {
    await this.http.post(`/api/admin/${username}/users/activate`)
  }

  async resetAdminUsage(username: string): Promise<Admin> {
    const response = await this.http.post<Admin>(`/api/admin/usage/reset/${username}`)
    return response.data
  }

  async getAdminUsage(username: string): Promise<number> {
    const response = await this.http.get<number>(`/api/admin/usage/${username}`)
    return response.data
  }

  // User methods

  async addUser(data: UserCreate): Promise<UserResponse> {
    const response = await this.http.post<UserResponse>('/api/user', data)
    return response.data
  }

  async getUser(username: string): Promise<UserResponse> {
    const response = await this.http.get<UserResponse>(`/api/user/${username}`)
    return response.data
  }

  async modifyUser(username: string, data: UserModify): Promise<UserResponse> {
    const response = await this.http.put<UserResponse>(`/api/user/${username}`, data)
    return response.data
  }

  async removeUser(username: string): Promise<void> {
    await this.http.delete(`/api/user/${username}`)
  }

  async resetUserDataUsage(username: string): Promise<UserResponse> {
    const response = await this.http.post<UserResponse>(`/api/user/${username}/reset`)
    return response.data
  }

  async revokeUserSubscription(username: string): Promise<UserResponse> {
    const response = await this.http.post<UserResponse>(`/api/user/${username}/revoke_sub`)
    return response.data
  }

  async getUsers(params?: GetUsersParams): Promise<UsersResponse> {
    const response = await this.http.get<UsersResponse>('/api/users', { params })
    return response.data
  }

  async resetUsersDataUsage(): Promise<void> {
    await this.http.post('/api/users/reset')
  }

  async getUserUsage(username: string, params?: DateRangeParams): Promise<UserUsagesResponse> {
    const response = await this.http.get<UserUsagesResponse>(`/api/user/${username}/usage`, {
      params,
    })
    return response.data
  }

  async activeNextPlan(username: string): Promise<UserResponse> {
    const response = await this.http.post<UserResponse>(`/api/user/${username}/active-next`)
    return response.data
  }

  async getUsersUsage(params?: GetUsersUsageParams): Promise<UsersUsagesResponse> {
    const response = await this.http.get<UsersUsagesResponse>('/api/users/usage', { params })
    return response.data
  }

  async setUserOwner(username: string, adminUsername: string): Promise<UserResponse> {
    const response = await this.http.put<UserResponse>(`/api/user/${username}/set-owner`, null, {
      params: { admin_username: adminUsername },
    })
    return response.data
  }

  async getExpiredUsers(params?: ExpiredUsersParams): Promise<string[]> {
    const response = await this.http.get<string[]>('/api/users/expired', { params })
    return response.data
  }

  async deleteExpiredUsers(params?: ExpiredUsersParams): Promise<string[]> {
    const response = await this.http.delete<string[]>('/api/users/expired', { params })
    return response.data
  }

  // User Template methods

  async addUserTemplate(data: UserTemplateCreate): Promise<UserTemplateResponse> {
    const response = await this.http.post<UserTemplateResponse>('/api/user_template', data)
    return response.data
  }

  async getUserTemplates(params?: PaginationParams): Promise<UserTemplateResponse[]> {
    const response = await this.http.get<UserTemplateResponse[]>('/api/user_template', { params })
    return response.data
  }

  async getUserTemplate(templateId: number): Promise<UserTemplateResponse> {
    const response = await this.http.get<UserTemplateResponse>(
      `/api/user_template/${templateId}`,
    )
    return response.data
  }

  async modifyUserTemplate(
    templateId: number,
    data: UserTemplateModify,
  ): Promise<UserTemplateResponse> {
    const response = await this.http.put<UserTemplateResponse>(
      `/api/user_template/${templateId}`,
      data,
    )
    return response.data
  }

  async removeUserTemplate(templateId: number): Promise<void> {
    await this.http.delete(`/api/user_template/${templateId}`)
  }

  // Node methods

  async getNodeSettings(): Promise<NodeSettings> {
    const response = await this.http.get<NodeSettings>('/api/node/settings')
    return response.data
  }

  async addNode(data: NodeCreate): Promise<NodeResponse> {
    const response = await this.http.post<NodeResponse>('/api/node', data)
    return response.data
  }

  async getNode(nodeId: number): Promise<NodeResponse> {
    const response = await this.http.get<NodeResponse>(`/api/node/${nodeId}`)
    return response.data
  }

  async modifyNode(nodeId: number, data: NodeModify): Promise<NodeResponse> {
    const response = await this.http.put<NodeResponse>(`/api/node/${nodeId}`, data)
    return response.data
  }

  async removeNode(nodeId: number): Promise<void> {
    await this.http.delete(`/api/node/${nodeId}`)
  }

  async getNodes(): Promise<NodeResponse[]> {
    const response = await this.http.get<NodeResponse[]>('/api/nodes')
    return response.data
  }

  async reconnectNode(nodeId: number): Promise<void> {
    await this.http.post(`/api/node/${nodeId}/reconnect`)
  }

  async getNodesUsage(params?: DateRangeParams): Promise<NodesUsageResponse> {
    const response = await this.http.get<NodesUsageResponse>('/api/nodes/usage', { params })
    return response.data
  }

  // System methods

  async getSystemStats(): Promise<SystemStats> {
    const response = await this.http.get<SystemStats>('/api/system')
    return response.data
  }

  async getInbounds(): Promise<Record<ProxyTypes, ProxyInbound[]>> {
    const response = await this.http.get<Record<ProxyTypes, ProxyInbound[]>>('/api/inbounds')
    return response.data
  }

  async getHosts(): Promise<Record<string, ProxyHost[]>> {
    const response = await this.http.get<Record<string, ProxyHost[]>>('/api/hosts')
    return response.data
  }

  async modifyHosts(hosts: Record<string, ProxyHost[]>): Promise<Record<string, ProxyHost[]>> {
    const response = await this.http.put<Record<string, ProxyHost[]>>('/api/hosts', hosts)
    return response.data
  }

  // Core methods

  async getCoreStats(): Promise<CoreStats> {
    const response = await this.http.get<CoreStats>('/api/core')
    return response.data
  }

  async restartCore(): Promise<void> {
    await this.http.post('/api/core/restart')
  }

  async getCoreConfig(): Promise<object> {
    const response = await this.http.get<object>('/api/core/config')
    return response.data
  }

  async modifyCoreConfig(config: object): Promise<object> {
    const response = await this.http.put<object>('/api/core/config', config)
    return response.data
  }

  // Subscription methods (no auth)

  async getUserSubscription(token: string, userAgent?: string): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (userAgent) headers['User-Agent'] = userAgent
    const response = await this.http.get(`/sub/${token}/`, {
      headers,
      _skipAuth: true,
    } as RetryableConfig)
    return response.data
  }

  async getUserSubscriptionInfo(token: string): Promise<SubscriptionUserResponse> {
    const response = await this.http.get<SubscriptionUserResponse>(`/sub/${token}/info`, {
      _skipAuth: true,
    } as RetryableConfig)
    return response.data
  }

  async getUserSubscriptionUsage(
    token: string,
    params?: DateRangeParams,
  ): Promise<unknown> {
    const response = await this.http.get(`/sub/${token}/usage`, {
      params,
      _skipAuth: true,
    } as RetryableConfig)
    return response.data
  }

  async getUserSubscriptionByClient(
    token: string,
    clientType: SubscriptionClientType,
    userAgent?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (userAgent) headers['User-Agent'] = userAgent
    const response = await this.http.get(`/sub/${token}/${clientType}`, {
      headers,
      _skipAuth: true,
    } as RetryableConfig)
    return response.data
  }
}
