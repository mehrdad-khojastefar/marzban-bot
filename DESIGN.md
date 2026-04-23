# Design

## Marzban Service — Public API Design

The Marzban service is the primary interface between this application and the Marzban VPN panel. This document describes the public surface callers interact with.

### Initialization

Call once at application startup (bot entry point, CLI entry point, or Next.js app init):

```typescript
import { initMarzban } from '@/core/marzban'

initMarzban({
  baseUrl: process.env.MARZBAN_API_URL,
  username: process.env.MARZBAN_USERNAME,
  password: process.env.MARZBAN_PASSWORD,
})
```

Calling `initMarzban` a second time throws. Calling `getMarzban` before `initMarzban` throws.

### Usage

```typescript
import { getMarzban, MarzbanError, isMarzbanError } from '@/core/marzban'

const marzban = getMarzban()

try {
  const user = await marzban.getUser('alice')
} catch (err) {
  if (isMarzbanError(err)) {
    switch (err.statusCode) {
      case 404: // user not found
      case 409: // conflict
      case 403: // forbidden
    }
  }
}
```

---

## Method Reference

### Auth (internal — not exposed)
Token management is fully automatic. Callers never handle tokens.

---

### Admin

```typescript
marzban.getAdmin()                                      // GET    /api/admin
marzban.createAdmin(data: AdminCreate)                  // POST   /api/admin
marzban.modifyAdmin(username, data: AdminModify)        // PUT    /api/admin/:username
marzban.removeAdmin(username)                           // DELETE /api/admin/:username
marzban.getAdmins(params?: GetAdminsParams)             // GET    /api/admins
marzban.disableAdminUsers(username)                     // POST   /api/admin/:username/users/disable
marzban.activateAdminUsers(username)                    // POST   /api/admin/:username/users/activate
marzban.resetAdminUsage(username)                       // POST   /api/admin/usage/reset/:username
marzban.getAdminUsage(username)                         // GET    /api/admin/usage/:username
```

---

### User

```typescript
marzban.addUser(data: UserCreate)                       // POST   /api/user
marzban.getUser(username)                               // GET    /api/user/:username
marzban.modifyUser(username, data: UserModify)          // PUT    /api/user/:username
marzban.removeUser(username)                            // DELETE /api/user/:username
marzban.resetUserDataUsage(username)                    // POST   /api/user/:username/reset
marzban.revokeUserSubscription(username)                // POST   /api/user/:username/revoke_sub
marzban.getUsers(params?: GetUsersParams)               // GET    /api/users
marzban.resetUsersDataUsage()                           // POST   /api/users/reset
marzban.getUserUsage(username, params?: DateRangeParams)// GET    /api/user/:username/usage
marzban.activeNextPlan(username)                        // POST   /api/user/:username/active-next
marzban.getUsersUsage(params?: GetUsersUsageParams)     // GET    /api/users/usage
marzban.setUserOwner(username, adminUsername)           // PUT    /api/user/:username/set-owner
marzban.getExpiredUsers(params?: ExpiredUsersParams)    // GET    /api/users/expired
marzban.deleteExpiredUsers(params?: ExpiredUsersParams) // DELETE /api/users/expired
```

---

### User Template

```typescript
marzban.addUserTemplate(data: UserTemplateCreate)       // POST   /api/user_template
marzban.getUserTemplates(params?: PaginationParams)     // GET    /api/user_template
marzban.getUserTemplate(templateId: number)             // GET    /api/user_template/:id
marzban.modifyUserTemplate(id, data: UserTemplateModify)// PUT    /api/user_template/:id
marzban.removeUserTemplate(templateId: number)          // DELETE /api/user_template/:id
```

---

### Node

```typescript
marzban.getNodeSettings()                               // GET    /api/node/settings
marzban.addNode(data: NodeCreate)                       // POST   /api/node
marzban.getNode(nodeId: number)                         // GET    /api/node/:id
marzban.modifyNode(nodeId: number, data: NodeModify)    // PUT    /api/node/:id
marzban.removeNode(nodeId: number)                      // DELETE /api/node/:id
marzban.getNodes()                                      // GET    /api/nodes
marzban.reconnectNode(nodeId: number)                   // POST   /api/node/:id/reconnect
marzban.getNodesUsage(params?: DateRangeParams)         // GET    /api/nodes/usage
```

---

### System

```typescript
marzban.getSystemStats()                                // GET    /api/system
marzban.getInbounds()                                   // GET    /api/inbounds
marzban.getHosts()                                      // GET    /api/hosts
marzban.modifyHosts(hosts: Record<string, ProxyHost[]>) // PUT    /api/hosts
```

---

### Core

```typescript
marzban.getCoreStats()                                  // GET    /api/core
marzban.restartCore()                                   // POST   /api/core/restart
marzban.getCoreConfig()                                 // GET    /api/core/config
marzban.modifyCoreConfig(config: object)                // PUT    /api/core/config
```

---

### Subscription (no auth required)

```typescript
marzban.getUserSubscription(token, userAgent?)          // GET    /sub/:token/
marzban.getUserSubscriptionInfo(token)                  // GET    /sub/:token/info
marzban.getUserSubscriptionUsage(token, params?)        // GET    /sub/:token/usage
marzban.getUserSubscriptionByClient(token, clientType)  // GET    /sub/:token/:client_type
```

---

## Type Reference

### Enums (string-literal unions)

```typescript
type UserStatus = 'active' | 'disabled' | 'limited' | 'expired' | 'on_hold'
type UserStatusCreate = 'active' | 'on_hold'
type UserStatusModify = 'active' | 'disabled' | 'on_hold'
type UserDataLimitResetStrategy = 'no_reset' | 'day' | 'week' | 'month' | 'year'
type ProxyTypes = 'vmess' | 'vless' | 'trojan' | 'shadowsocks'
type NodeStatus = 'connected' | 'connecting' | 'error' | 'disabled'
type SubscriptionClientType = 'sing-box' | 'clash-meta' | 'clash' | 'outline' | 'v2ray' | 'v2ray-json'
type ProxyHostSecurity = 'inbound_default' | 'none' | 'tls'
```

### Key Params Interfaces

```typescript
interface GetUsersParams {
  offset?: number
  limit?: number
  username?: string[]   // repeated: ?username=a&username=b
  search?: string
  admin?: string[]      // repeated
  status?: UserStatus
  sort?: string
}

interface GetAdminsParams {
  offset?: number
  limit?: number
  username?: string
}

interface DateRangeParams {
  start?: string
  end?: string
}

interface ExpiredUsersParams {
  expired_after?: string   // ISO datetime
  expired_before?: string  // ISO datetime
}

interface PaginationParams {
  offset?: number
  limit?: number
}

interface GetUsersUsageParams extends DateRangeParams {
  admin?: string[]
}
```

---

## Error Design

```typescript
class MarzbanError extends Error {
  statusCode: number
  body: unknown
}

function isMarzbanError(err: unknown): err is MarzbanError
```

| Status | Meaning |
|---|---|
| 400 | Bad request / validation |
| 401 | Unauthenticated (after retry — bad credentials) |
| 403 | Forbidden (insufficient privileges) |
| 404 | Entity not found |
| 409 | Conflict (duplicate entity) |
| 422 | Unprocessable (FastAPI schema validation) |

---

## Testing Patterns

### Mocking axios

```typescript
import axios from 'axios'
import { vi } from 'vitest'

const mockAxios = vi.spyOn(axios, 'request')

mockAxios.mockResolvedValueOnce({ data: { access_token: 'tok', token_type: 'bearer' } })
mockAxios.mockResolvedValueOnce({ data: { username: 'alice', status: 'active', ... } })
```

### Asserting array query params

```typescript
// getUsers({ username: ['alice', 'bob'] }) should produce:
// GET /api/users?username=alice&username=bob
expect(mockAxios.mock.calls[1][0].params.username).toEqual(['alice', 'bob'])
// and verify paramsSerializer produces repeated keys, not comma-joined
```
