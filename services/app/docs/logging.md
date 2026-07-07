# Logging Guide — CronJob Manager

## Overview

The app uses three log categories stored in Firebase RTDB:

| Path | Content | Source |
|------|---------|--------|
| `/logs/jobs` | Cron-job execution history | Cron-job.org API polling |
| `/logs/exec` | Local executor run logs | Backend executor |
| `/logs/app` | Application-level logs | Backend + Frontend |

---

## App Logs (`/logs/app`)

### Structure
```
{
  id: string          // UUID
  scope: "backend" | "frontend" | "provider"
  level: "debug" | "info" | "warn" | "error"
  provider: "cronjob" | "github" | "azure" | "none"
  action: string      // e.g., "job.create", "provider.github.verify"
  message: string     // Human-readable description
  context: object     // Arbitrary data (auto-masked)
  location: string    // File/function where log was written
  timestamp: number   // Unix ms
}
```

### Automatic Logging

The backend automatically logs:
- **Error responses** (5xx) → `scope=backend, level=error`
- **Slow requests** (>2s) → `scope=backend, level=warn`
- **Provider API calls** → `scope=provider, provider=cronjob|github|azure`

### Frontend Logging

```tsx
import { api } from "@/lib/api";
await api.post("logs/app", {
  scope: "frontend",
  level: "error",
  provider: "none",
  action: "ui.submit",
  message: "Failed to create job",
  context: { error: err.message },
  location: "cronjobs/page.tsx:handleSubmit"
});
```

### Secret Masking

All `context` objects are recursively masked before storage. Values matching these patterns are masked:
- Strings containing known secret keys (token, key, secret, password, pat)
- Long strings that look like tokens (>20 chars)
- Header values for Authorization, X-API-Key, etc.

Masked format: `****abcd` (last 4 chars visible)

---

## Log Querying

### API
```
GET /logs/app?scope=provider&level=error&provider=github
```

All filter params are optional. Multiple filters combine with AND logic.

### Frontend
The Logs page (`/logs`) provides a filterable view with:
- Scope dropdown (backend/frontend/provider)
- Level dropdown (debug/info/warn/error)
- Provider dropdown (cronjob/github/azure)
- Auto-refresh on filter change

---

## Task Tracker

Tasks are NOT logs — they are tracked separately at `/tasks` and displayed in the Logs → Task Tracker tab.

Task kinds: `task`, `bug`, `improvement`
Task statuses: `todo`, `in_progress`, `done`
Task priorities: `low`, `medium`, `high`

Tasks can be exported as Markdown for agent handoff:
```
GET /tasks/export/markdown → { "markdown": "..." }
```

---

## Best Practices for Agents

1. **Always log provider calls** with `scope=provider` and the correct `provider` value
2. **Include `context`** with relevant IDs (jobId, tokenId, etc.) but never raw secrets
3. **Use `location`** to help trace where the log was written
4. **Frontend errors** should be logged to `/logs/app` with `scope=frontend`
5. **Check app logs first** when debugging — they often contain the root cause
