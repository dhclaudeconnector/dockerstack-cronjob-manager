# Internal API Reference

Base URL: `/api` (proxied via frontend `/proxy/[...path]` with `x-api-secret` injected server-side).

All endpoints require `x-api-secret` header when called directly.

---

## Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List all managed jobs |
| POST | `/jobs` | Create a new job |
| GET | `/jobs/:jobId` | Get job detail |
| PATCH | `/jobs/:jobId` | Update job |
| DELETE | `/jobs/:jobId` | Delete job |
| GET | `/jobs/:jobId/logs` | Get execution history for a job |

### Create Job Body
```json
{
  "title": "string",
  "accountId": "string",
  "url": "string",
  "schedule": { "timezone": "Asia/Bangkok", "hours": [9], "mdays": [1] },
  "enabled": true,
  "requestMethod": 0,
  "headers": [{ "name": "Authorization", "value": "Bearer <token>" }]
}
```

---

## Resources (Tokens/Secrets)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resources` | List all resources (secrets masked) |
| POST | `/resources` | Create resource |
| PATCH | `/resources/:id` | Update resource |
| DELETE | `/resources/:id` | Delete resource |
| POST | `/resources/import` | Import resources from JSON |
| GET | `/resources/export` | Export resources as JSON |

Resource types: `cronjob-account`, `github-token`, `azure-pat`

Secrets are AES-256-GCM encrypted at rest. API responses return masked values (`****abcd`).

---

## cURL Export

| Method | Path | Description |
|--------|------|-------------|
| POST | `/curl` | Generate cURL from input config |
| GET | `/jobs/:jobId/curl` | Generate cURL from existing job |

### POST /curl Body
```json
{
  "url": "string",
  "method": "GET",
  "headers": [{ "name": "Authorization", "value": "Bearer xxx" }],
  "body": "optional",
  "masked": true
}
```

Response: `{ "curl": "curl -X GET ...", "curlMasked": "curl -X GET ..." }`

---

## Providers (GitHub / Azure)

### GitHub

| Method | Path | Description |
|--------|------|-------------|
| GET | `/providers/github/verify?tokenId=xxx` | Verify GitHub token |
| GET | `/providers/github/repos?tokenId=xxx` | List user repos |
| GET | `/providers/github/workflows?tokenId=xxx&owner=xxx&repo=xxx` | List repo workflows |
| GET | `/providers/github/branches?tokenId=xxx&owner=xxx&repo=xxx` | List repo branches |

### Azure DevOps

| Method | Path | Description |
|--------|------|-------------|
| GET | `/providers/azure/verify?patId=xxx` | Verify Azure PAT |
| GET | `/providers/azure/projects?patId=xxx` | List projects |
| GET | `/providers/azure/pipelines?patId=xxx&project=xxx` | List pipelines |

---

## Task Tracker

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List all tasks |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |
| GET | `/tasks/export/markdown` | Export tasks as Markdown |

### Task Item
```json
{
  "id": "string",
  "title": "string",
  "detail": "string",
  "kind": "task" | "bug" | "improvement",
  "priority": "low" | "medium" | "high",
  "status": "todo" | "in_progress" | "done",
  "tags": ["string"],
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

---

## App Logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/logs/app` | Query app logs (filters: scope, level, provider) |
| POST | `/logs/app` | Write app log (frontend → backend) |
| DELETE | `/logs/app` | Clear all app logs |

### App Log Entry
```json
{
  "id": "string",
  "scope": "backend" | "frontend" | "provider",
  "level": "debug" | "info" | "warn" | "error",
  "provider": "cronjob" | "github" | "azure" | "none",
  "action": "string",
  "message": "string",
  "context": {},
  "location": "string",
  "timestamp": 1234567890
}
```

All `context` objects are recursively masked — secrets appear as `****abcd`.

---

## Execution Logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/logs/exec` | List execution logs |

### Exec Log Entry
```json
{
  "execId": "string",
  "target": { "type": "string", "name": "string" },
  "source": "string",
  "status": "ok" | "error",
  "startedAt": 1234567890,
  "durationMs": 500,
  "error": "string | null",
  "outputPreview": "string | null"
}
```

---

## Executor

| Method | Path | Description |
|--------|------|-------------|
| POST | `/executor/run/:targetType/:targetName` | Run a target immediately |
