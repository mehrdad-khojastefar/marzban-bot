// String-literal union types

export type UserStatus = 'active' | 'disabled' | 'limited' | 'expired' | 'on_hold'

export type UserStatusCreate = 'active' | 'on_hold'

export type UserStatusModify = 'active' | 'disabled' | 'on_hold'

export type UserDataLimitResetStrategy = 'no_reset' | 'day' | 'week' | 'month' | 'year'

export type ProxyTypes = 'vmess' | 'vless' | 'trojan' | 'shadowsocks'

export type NodeStatus = 'connected' | 'connecting' | 'error' | 'disabled'

export type ProxyHostSecurity = 'inbound_default' | 'none' | 'tls'

export type ProxyHostALPN =
  | ''
  | 'h3'
  | 'h2'
  | 'http/1.1'
  | 'h3,h2,http/1.1'
  | 'h3,h2'
  | 'h2,http/1.1'

export type ProxyHostFingerprint =
  | ''
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'ios'
  | 'android'
  | 'edge'
  | '360'
  | 'qq'
  | 'random'
  | 'randomized'

export type SubscriptionClientType =
  | 'sing-box'
  | 'clash-meta'
  | 'clash'
  | 'outline'
  | 'v2ray'
  | 'v2ray-json'

// Object interfaces

export interface Token {
  access_token: string
  token_type?: string
}

export interface MarzbanClientConfig {
  baseUrl: string
  username: string
  password: string
}

export interface Admin {
  username: string
  is_sudo: boolean
  telegram_id?: number | null
  discord_webhook?: string | null
  users_usage?: number | null
}

export interface AdminCreate {
  username: string
  is_sudo: boolean
  password: string
  telegram_id?: number | null
  discord_webhook?: string | null
  users_usage?: number | null
}

export interface AdminModify {
  password?: string | null
  is_sudo: boolean
  telegram_id?: number | null
  discord_webhook?: string | null
}

export interface CoreStats {
  version: string
  started: boolean
  logs_websocket: string
}

export interface SystemStats {
  version: string
  mem_total: number
  mem_used: number
  cpu_cores: number
  cpu_usage: number
  total_user: number
  online_users: number
  users_active: number
  users_on_hold: number
  users_disabled: number
  users_expired: number
  users_limited: number
  incoming_bandwidth: number
  outgoing_bandwidth: number
  incoming_bandwidth_speed: number
  outgoing_bandwidth_speed: number
}

export interface NodeCreate {
  name: string
  address: string
  port?: number
  api_port?: number
  usage_coefficient?: number
  add_as_new_host?: boolean
}

export interface NodeModify {
  name?: string | null
  address?: string | null
  port?: number | null
  api_port?: number | null
  usage_coefficient?: number | null
  status?: NodeStatus | null
}

export interface NodeResponse {
  name: string
  address: string
  port: number
  api_port: number
  usage_coefficient: number
  id: number
  xray_version?: string | null
  status: NodeStatus
  message?: string | null
}

export interface NodeSettings {
  min_node_version?: string
  certificate: string
}

export interface NodeUsageResponse {
  node_id?: number | null
  node_name: string
  uplink: number
  downlink: number
}

export interface NodesUsageResponse {
  usages: NodeUsageResponse[]
}

export interface ProxyHost {
  remark: string
  address: string
  port?: number | null
  sni?: string | null
  host?: string | null
  path?: string | null
  security?: ProxyHostSecurity
  alpn?: ProxyHostALPN
  fingerprint?: ProxyHostFingerprint
  allowinsecure?: boolean | null
  is_disabled?: boolean | null
  mux_enable?: boolean | null
  fragment_setting?: string | null
  noise_setting?: string | null
  random_user_agent?: boolean | null
  use_sni_as_host?: boolean | null
}

export interface ProxyInbound {
  tag: string
  protocol: ProxyTypes
  network: string
  tls: string
  port: number | string
}

export interface ProxySettings {
  [key: string]: unknown
}

export interface NextPlanModel {
  data_limit?: number | null
  expire?: number | null
  add_remaining_traffic?: boolean
  fire_on_either?: boolean
}

export interface UserCreate {
  username: string
  status?: UserStatusCreate
  proxies?: Partial<Record<ProxyTypes, ProxySettings>>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: UserDataLimitResetStrategy
  inbounds?: Partial<Record<ProxyTypes, string[]>>
  note?: string | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
}

export interface UserModify {
  status?: UserStatusModify
  proxies?: Partial<Record<ProxyTypes, ProxySettings>>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: UserDataLimitResetStrategy
  inbounds?: Partial<Record<ProxyTypes, string[]>>
  note?: string | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
}

export interface UserResponse {
  proxies: Record<string, unknown>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy: UserDataLimitResetStrategy
  inbounds: Partial<Record<ProxyTypes, string[]>>
  note?: string | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
  username: string
  status: UserStatus
  used_traffic: number
  lifetime_used_traffic: number
  created_at: string
  links: string[]
  subscription_url: string
  excluded_inbounds: Partial<Record<ProxyTypes, string[]>>
  admin?: Admin | null
}

export interface UsersResponse {
  users: UserResponse[]
  total: number
}

export interface UserUsageResponse {
  node_id?: number | null
  node_name: string
  used_traffic: number
}

export interface UserUsagesResponse {
  username: string
  usages: UserUsageResponse[]
}

export interface UsersUsagesResponse {
  usages: UserUsageResponse[]
}

export interface UserTemplateCreate {
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds?: Partial<Record<ProxyTypes, string[]>>
}

export interface UserTemplateModify {
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds?: Partial<Record<ProxyTypes, string[]>>
}

export interface UserTemplateResponse {
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds: Partial<Record<ProxyTypes, string[]>>
  id: number
}

export interface SubscriptionUserResponse {
  proxies: Record<string, unknown>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy: UserDataLimitResetStrategy
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  next_plan?: NextPlanModel | null
  username: string
  status: UserStatus
  used_traffic: number
  lifetime_used_traffic: number
  created_at: string
  links: string[]
  subscription_url: string
}

// Query param interfaces

export interface GetUsersParams {
  offset?: number
  limit?: number
  username?: string[]
  search?: string | null
  admin?: string[] | null
  status?: UserStatus
  sort?: string
}

export interface GetAdminsParams {
  offset?: number | null
  limit?: number | null
  username?: string | null
}

export interface GetUserTemplatesParams {
  offset?: number
  limit?: number
}

export interface DateRangeParams {
  start?: string
  end?: string
}

export interface ExpiredUsersParams {
  expired_after?: string | null
  expired_before?: string | null
}

export interface PaginationParams {
  offset?: number
  limit?: number
}

export interface GetUsersUsageParams {
  start?: string
  end?: string
  admin?: string[] | null
}
