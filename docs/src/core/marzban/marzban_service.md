# Marzban Service — Internal Documentation

## Overview

The Marzban service is a typed TypeScript client that wraps the Marzban VPN panel REST API. It lives at `src/core/marzban/` and is the only module allowed to communicate with the Marzban panel over HTTP.

The service provides:

- Full coverage of the Marzban admin API (users, admins, nodes, templates, system, core, subscriptions)
- Automatic authentication with lazy token fetch and transparent 401 retry
- Typed request/response interfaces mirroring the Marzban OpenAPI schema
- A singleton access pattern that prevents multiple client instances

**File layout:**

```
src/core/marzban/
├── types.ts          # All TypeScript interfaces and string-literal unions
├── errors.ts         # MarzbanError class + isMarzbanError() type guard
├── client.ts         # MarzbanClient class (not exported publicly)
├── singleton.ts      # initMarzban() / getMarzban() lifecycle functions
├── index.ts          # Public barrel — re-exports types, errors, singleton helpers
└── __tests__/
    ├── helpers.ts    # Shared test utilities (mock axios, interceptor runners)
    ├── auth.test.ts
    ├── admin.test.ts
    ├── user.test.ts
    ├── node.test.ts
    ├── system.test.ts
    ├── core.test.ts
    ├── userTemplate.test.ts
    ├── subscription.test.ts
    ├── singleton.test.ts
    └── errors.test.ts
```

---

## Setup & Initialization

### Required Environment Variables

| Variable | Description |
|---|---|
| `MARZBAN_API_URL` | Base URL of the Marzban panel (e.g. `https://panel.example.com`) |
| `MARZBAN_USERNAME` | Admin username for API authentication |
| `MARZBAN_PASSWORD` | Admin password for API authentication |

### Initialization

Call `initMarzban` once at application startup (bot entry point, CLI entry point, or Next.js app init):

```typescript
import { initMarzban } from '@/core/marzban'

initMarzban({
  baseUrl: process.env.MARZBAN_API_URL,
  username: process.env.MARZBAN_USERNAME,
  password: process.env.MARZBAN_PASSWORD,
})
```

Then use `getMarzban()` anywhere to get the client instance:

```typescript
import { getMarzban } from '@/core/marzban'

const marzban = getMarzban()
const user = await marzban.getUser('alice')
```

### Guards

- Calling `initMarzban` a second time throws: `"Marzban client already initialized"`
- Calling `getMarzban` before `initMarzban` throws: `"Marzban client not initialized. Call initMarzban() first"`

---

## Authentication

Authentication is fully automatic. Callers never handle tokens.

### How it works

1. **Lazy fetch** -- No token is fetched at startup. The first API call triggers authentication via `POST /api/admin/token` (form-urlencoded with `username`, `password`, `grant_type=password`).
2. **Token caching** -- Once fetched, the token is stored in memory and reused for all subsequent requests via an axios request interceptor that sets the `Authorization: Bearer <token>` header.
3. **In-flight deduplication** -- If multiple requests fire concurrently before the token is ready, only one auth call is made. All waiting requests share the same promise.
4. **401 retry** -- If a request returns 401, the client invalidates the cached token, re-authenticates, and retries the request exactly once. If the retry also returns 401, a `MarzbanError` with `statusCode: 401` is thrown.
5. **Skipped auth** -- The token endpoint itself (`/api/admin/token`) and requests with `_skipAuth: true` (subscription endpoints) bypass the auth interceptor entirely.

### Auth flow diagram

```
Incoming request
     |
     v
ensureToken()
     |
     +-- token cached? --yes--> inject Bearer header --> send request
     |
     +-- no --> tokenFetchPromise exists? --yes--> await it (dedup)
                     |
                     no
                     |
                     v
              POST /api/admin/token (form-urlencoded)
                     |
                     v
              cache token --> inject Bearer header --> send request
                                                          |
                                                   401 response?
                                                          |
                                                   yes (first time)
                                                          |
                                                   invalidate token
                                                          |
                                                   re-auth + retry once
                                                          |
                                                   401 again? --> throw MarzbanError(401)
```

---

## API Reference

All methods are async and return the deserialized response body. Methods that delete or trigger actions without a response body return `Promise<void>`.

### Admin

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `getAdmin` | `() => Promise<Admin>` | GET | `/api/admin` |
| `createAdmin` | `(data: AdminCreate) => Promise<Admin>` | POST | `/api/admin` |
| `modifyAdmin` | `(username: string, data: AdminModify) => Promise<Admin>` | PUT | `/api/admin/:username` |
| `removeAdmin` | `(username: string) => Promise<void>` | DELETE | `/api/admin/:username` |
| `getAdmins` | `(params?: GetAdminsParams) => Promise<Admin[]>` | GET | `/api/admins` |
| `disableAdminUsers` | `(username: string) => Promise<void>` | POST | `/api/admin/:username/users/disable` |
| `activateAdminUsers` | `(username: string) => Promise<void>` | POST | `/api/admin/:username/users/activate` |
| `resetAdminUsage` | `(username: string) => Promise<Admin>` | POST | `/api/admin/usage/reset/:username` |
| `getAdminUsage` | `(username: string) => Promise<number>` | GET | `/api/admin/usage/:username` |

### User

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `addUser` | `(data: UserCreate) => Promise<UserResponse>` | POST | `/api/user` |
| `getUser` | `(username: string) => Promise<UserResponse>` | GET | `/api/user/:username` |
| `modifyUser` | `(username: string, data: UserModify) => Promise<UserResponse>` | PUT | `/api/user/:username` |
| `removeUser` | `(username: string) => Promise<void>` | DELETE | `/api/user/:username` |
| `resetUserDataUsage` | `(username: string) => Promise<UserResponse>` | POST | `/api/user/:username/reset` |
| `revokeUserSubscription` | `(username: string) => Promise<UserResponse>` | POST | `/api/user/:username/revoke_sub` |
| `getUsers` | `(params?: GetUsersParams) => Promise<UsersResponse>` | GET | `/api/users` |
| `resetUsersDataUsage` | `() => Promise<void>` | POST | `/api/users/reset` |
| `getUserUsage` | `(username: string, params?: DateRangeParams) => Promise<UserUsagesResponse>` | GET | `/api/user/:username/usage` |
| `activeNextPlan` | `(username: string) => Promise<UserResponse>` | POST | `/api/user/:username/active-next` |
| `getUsersUsage` | `(params?: GetUsersUsageParams) => Promise<UsersUsagesResponse>` | GET | `/api/users/usage` |
| `setUserOwner` | `(username: string, adminUsername: string) => Promise<UserResponse>` | PUT | `/api/user/:username/set-owner` |
| `getExpiredUsers` | `(params?: ExpiredUsersParams) => Promise<string[]>` | GET | `/api/users/expired` |
| `deleteExpiredUsers` | `(params?: ExpiredUsersParams) => Promise<string[]>` | DELETE | `/api/users/expired` |

### User Template

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `addUserTemplate` | `(data: UserTemplateCreate) => Promise<UserTemplateResponse>` | POST | `/api/user_template` |
| `getUserTemplates` | `(params?: PaginationParams) => Promise<UserTemplateResponse[]>` | GET | `/api/user_template` |
| `getUserTemplate` | `(templateId: number) => Promise<UserTemplateResponse>` | GET | `/api/user_template/:id` |
| `modifyUserTemplate` | `(templateId: number, data: UserTemplateModify) => Promise<UserTemplateResponse>` | PUT | `/api/user_template/:id` |
| `removeUserTemplate` | `(templateId: number) => Promise<void>` | DELETE | `/api/user_template/:id` |

### Node

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `getNodeSettings` | `() => Promise<NodeSettings>` | GET | `/api/node/settings` |
| `addNode` | `(data: NodeCreate) => Promise<NodeResponse>` | POST | `/api/node` |
| `getNode` | `(nodeId: number) => Promise<NodeResponse>` | GET | `/api/node/:id` |
| `modifyNode` | `(nodeId: number, data: NodeModify) => Promise<NodeResponse>` | PUT | `/api/node/:id` |
| `removeNode` | `(nodeId: number) => Promise<void>` | DELETE | `/api/node/:id` |
| `getNodes` | `() => Promise<NodeResponse[]>` | GET | `/api/nodes` |
| `reconnectNode` | `(nodeId: number) => Promise<void>` | POST | `/api/node/:id/reconnect` |
| `getNodesUsage` | `(params?: DateRangeParams) => Promise<NodesUsageResponse>` | GET | `/api/nodes/usage` |

### System

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `getSystemStats` | `() => Promise<SystemStats>` | GET | `/api/system` |
| `getInbounds` | `() => Promise<Record<ProxyTypes, ProxyInbound[]>>` | GET | `/api/inbounds` |
| `getHosts` | `() => Promise<Record<string, ProxyHost[]>>` | GET | `/api/hosts` |
| `modifyHosts` | `(hosts: Record<string, ProxyHost[]>) => Promise<Record<string, ProxyHost[]>>` | PUT | `/api/hosts` |

### Core

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `getCoreStats` | `() => Promise<CoreStats>` | GET | `/api/core` |
| `restartCore` | `() => Promise<void>` | POST | `/api/core/restart` |
| `getCoreConfig` | `() => Promise<object>` | GET | `/api/core/config` |
| `modifyCoreConfig` | `(config: object) => Promise<object>` | PUT | `/api/core/config` |

### Subscription (no auth required)

These endpoints use the user's subscription token, not admin auth. The auth interceptor is skipped via `_skipAuth: true`.

| Method | Signature | HTTP | Endpoint |
|---|---|---|---|
| `getUserSubscription` | `(token: string, userAgent?: string) => Promise<unknown>` | GET | `/sub/:token/` |
| `getUserSubscriptionInfo` | `(token: string) => Promise<SubscriptionUserResponse>` | GET | `/sub/:token/info` |
| `getUserSubscriptionUsage` | `(token: string, params?: DateRangeParams) => Promise<unknown>` | GET | `/sub/:token/usage` |
| `getUserSubscriptionByClient` | `(token: string, clientType: SubscriptionClientType, userAgent?: string) => Promise<unknown>` | GET | `/sub/:token/:client_type` |

---

## Types

All types are exported from `@/core/marzban` and mirror the Marzban OpenAPI schema using snake_case field names (no casing transformation).

### String-literal unions (enums)

| Type | Values |
|---|---|
| `UserStatus` | `'active'`, `'disabled'`, `'limited'`, `'expired'`, `'on_hold'` |
| `UserStatusCreate` | `'active'`, `'on_hold'` |
| `UserStatusModify` | `'active'`, `'disabled'`, `'on_hold'` |
| `UserDataLimitResetStrategy` | `'no_reset'`, `'day'`, `'week'`, `'month'`, `'year'` |
| `ProxyTypes` | `'vmess'`, `'vless'`, `'trojan'`, `'shadowsocks'` |
| `NodeStatus` | `'connected'`, `'connecting'`, `'error'`, `'disabled'` |
| `SubscriptionClientType` | `'sing-box'`, `'clash-meta'`, `'clash'`, `'outline'`, `'v2ray'`, `'v2ray-json'` |
| `ProxyHostSecurity` | `'inbound_default'`, `'none'`, `'tls'` |

### Key request interfaces

```typescript
interface UserCreate {
  username: string
  status?: UserStatusCreate
  proxies?: Partial<Record<ProxyTypes, ProxySettings>>
  expire?: number | null           // Unix timestamp
  data_limit?: number | null       // Bytes
  data_limit_reset_strategy?: UserDataLimitResetStrategy
  inbounds?: Partial<Record<ProxyTypes, string[]>>
  note?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
}

interface GetUsersParams {
  offset?: number
  limit?: number
  username?: string[]   // Serialized as repeated keys: ?username=a&username=b
  search?: string | null
  admin?: string[] | null
  status?: UserStatus
  sort?: string         // e.g. '-created_at' for descending
}

interface DateRangeParams {
  start?: string        // ISO datetime
  end?: string
}
```

### Key response interfaces

```typescript
interface UserResponse {
  username: string
  status: UserStatus
  used_traffic: number
  lifetime_used_traffic: number
  created_at: string
  links: string[]
  subscription_url: string
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy: UserDataLimitResetStrategy
  inbounds: Partial<Record<ProxyTypes, string[]>>
  admin?: Admin | null
  // ... additional fields
}

interface UsersResponse {
  users: UserResponse[]
  total: number
}

interface SystemStats {
  version: string
  mem_total: number
  mem_used: number
  cpu_cores: number
  cpu_usage: number
  total_user: number
  online_users: number
  users_active: number
  incoming_bandwidth: number
  outgoing_bandwidth: number
  // ... additional fields
}
```

### Array query parameter serialization

The Marzban API (FastAPI) expects repeated keys for array parameters:

```
/api/users?username=alice&username=bob    (correct)
/api/users?username=alice,bob             (incorrect)
```

The client handles this automatically via a custom `paramsSerializer` on the axios instance that uses `URLSearchParams.append()` for array values.

---

## Error Handling

### MarzbanError

All HTTP errors are wrapped in `MarzbanError`, which extends `Error`:

```typescript
class MarzbanError extends Error {
  readonly statusCode: number  // HTTP status code (0 if no response)
  readonly body?: unknown      // Raw response body from the API
}
```

### Type guard

Use `isMarzbanError()` to narrow the type in catch blocks:

```typescript
import { getMarzban, isMarzbanError } from '@/core/marzban'

try {
  await getMarzban().getUser('alice')
} catch (err) {
  if (isMarzbanError(err)) {
    switch (err.statusCode) {
      case 404:
        // User not found
        break
      case 409:
        // Conflict (duplicate)
        break
      case 403:
        // Forbidden
        break
      case 422:
        // Validation error — check err.body for details
        break
      default:
        // Unexpected error
        break
    }
  }
  // Non-Marzban error (network failure, etc.)
  throw err
}
```

### Status code reference

| Status | Meaning | When it happens |
|---|---|---|
| 0 | No response | Network error, timeout, DNS failure |
| 400 | Bad request | Malformed request body |
| 401 | Unauthenticated | Bad credentials (after automatic retry) |
| 403 | Forbidden | Insufficient admin privileges |
| 404 | Not found | User, admin, node, or template does not exist |
| 409 | Conflict | Attempting to create a duplicate entity |
| 422 | Unprocessable entity | FastAPI schema validation failure |

### 401 handling detail

A single 401 is retried transparently (the client re-authenticates and replays the request). The caller only sees a 401 `MarzbanError` if the second attempt also fails, which typically means the credentials in `MarzbanClientConfig` are wrong.

---

## Testing

### Test structure

Tests live in `src/core/marzban/__tests__/` and are split by concern:

| File | Covers |
|---|---|
| `auth.test.ts` | Token fetch, caching, deduplication, 401 retry, interceptor registration |
| `admin.test.ts` | All admin CRUD and usage methods |
| `user.test.ts` | All user CRUD, usage, expired, owner methods |
| `node.test.ts` | Node CRUD, reconnect, usage |
| `system.test.ts` | System stats, inbounds, hosts |
| `core.test.ts` | Core stats, restart, config |
| `userTemplate.test.ts` | Template CRUD |
| `subscription.test.ts` | Subscription endpoints (no-auth) |
| `singleton.test.ts` | initMarzban/getMarzban lifecycle |
| `errors.test.ts` | MarzbanError construction, isMarzbanError guard |

### Mocking strategy

Tests mock axios at the module level (`vi.mock('axios')`) and use a shared `setupClient()` helper from `__tests__/helpers.ts`. This helper:

1. Creates a mock axios instance with mock `get`, `post`, `put`, `delete` functions
2. Captures interceptor registrations so auth and error interceptors can be tested in isolation
3. Pre-configures the token endpoint to return `{ access_token: 'test-token' }`
4. Returns both the `MarzbanClient` instance and the mock for assertions

```typescript
import { setupClient, mockResponse } from './helpers'

it('should GET /api/user/:username', async () => {
  const { client, mock } = setupClient()
  mock.get.mockResolvedValueOnce(mockResponse(userFixture))

  const result = await client.getUser('alice')

  expect(mock.get).toHaveBeenCalledWith('/api/user/alice')
  expect(result).toEqual(userFixture)
})
```

### Testing interceptors directly

Auth tests use `runRequestInterceptor()` and `runResponseErrorInterceptor()` helpers to invoke interceptors in isolation without making HTTP calls:

```typescript
import { runRequestInterceptor, runResponseErrorInterceptor } from './helpers'

// Test that the request interceptor sets the Authorization header
const config = makeRequestConfig({ url: '/api/admin' })
const result = await runRequestInterceptor(mock, config)
expect(result.headers.get('Authorization')).toBe('Bearer test-token')
```

### Singleton tests

Singleton tests use `vi.resetModules()` in `beforeEach` to get a fresh module-level `instance` variable for each test, then dynamically import `../singleton`.

### Running tests

```bash
# Run all marzban tests
yarn vitest run src/core/marzban

# Run a specific test file
yarn vitest run src/core/marzban/__tests__/user.test.ts

# Watch mode
yarn vitest src/core/marzban
```

---

## Singleton Pattern

### Why the class is not exported

`MarzbanClient` is only exported from `client.ts` (for use by `singleton.ts` and tests). The public barrel (`index.ts`) does not re-export the class. This prevents callers from accidentally creating multiple client instances, each with their own token state and axios instance.

### Lifecycle

```typescript
// 1. At startup — call once
initMarzban({ baseUrl, username, password })

// 2. Anywhere in the app — call as many times as needed
const marzban = getMarzban()
await marzban.getUser('alice')
```

### What gets exported from `@/core/marzban`

```typescript
// Singleton helpers
export { initMarzban, getMarzban } from './singleton'

// Error handling
export { MarzbanError, isMarzbanError } from './errors'

// All types (re-exported from types.ts)
export type { UserResponse, UserCreate, Admin, ... } from './types'
```

The `MarzbanClient` class itself is deliberately absent from this list.
