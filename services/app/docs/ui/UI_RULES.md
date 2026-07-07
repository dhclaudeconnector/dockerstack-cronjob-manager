# UI Rules — CronJob Manager

These rules MUST be followed by all agents modifying the UI to prevent breakage.

---

## 1. Modal Close Behavior

**Rule:** All form modals must ONLY close via explicit close button or Cancel button. Clicking outside the modal overlay must NOT close the form.

**Why:** Users may accidentally click outside and lose filled form data. This is especially critical for forms with fetched dropdowns (GitHub repos, Azure pipelines) where re-fetching is expensive.

**Implementation:**
- ✅ Close via `<button onClick={onClose}>✕</button>` or Cancel button
- ✅ Close via Save/Submit button on success
- ❌ DO NOT add `onMouseDown` or `onClick` on overlay div that calls `onClose()`
- ❌ DO NOT use `onBackdropClick` or similar patterns

**Current compliant modals:**
- `NewJobModal` in `app/cronjobs/page.tsx`
- `Modal` in `app/resources/page.tsx`
- `RunModal` in `app/executor/page.tsx`
- `JobLogsModal` in `app/cronjobs/page.tsx`

---

## 2. Color Theme

Uses Material Design 3 (Material You) color tokens via Tailwind CSS:

| Token | Usage |
|-------|-------|
| `bg-surface` | Page background |
| `bg-surface-container` | Cards, panels |
| `bg-surface-container-lowest` | Modal backgrounds |
| `bg-primary` | Primary buttons, active tabs |
| `text-on-surface` | Primary text |
| `text-on-surface-variant` | Secondary text |
| `text-outline` | Tertiary/muted text |
| `border-outline-variant` | Borders |
| `bg-inverse-surface` | Code blocks, terminal-style displays |
| `text-inverse-on-surface` | Code text |

**Rule:** Always use theme tokens, never hardcode colors like `bg-gray-100` or `text-blue-500`.

---

## 3. Component Patterns

### Material Symbols Icon
```tsx
<span className="material-symbols-outlined text-[16px]">icon_name</span>
```

### StatusBadge
```tsx
<StatusBadge status="ok" /> // green dot + "OK"
<StatusBadge status="error" /> // red dot + "Error"
```

### Tag
```tsx
<Tag>tag-name</Tag>
```

### Topbar
```tsx
<Topbar title="Page Title" />
```

---

## 4. API Calls

All API calls go through `@/lib/api.ts` helper:

```tsx
import { api } from "@/lib/api";
const data = await api.get<JobMeta[]>("jobs");
await api.post("jobs", body);
await api.patch(`jobs/${id}`, update);
await api.del(`jobs/${id}`);
```

The `api` helper uses the `/proxy/[...path]` route which injects `x-api-secret` server-side.

**Rule:** NEVER call `/api/*` directly from client code. Always use `/proxy/*` via `api` helper.

---

## 5. Form Data Flow

### GitHub Workflow Dispatch
1. Select cron-job account → stored as `accountId`
2. Select GitHub token → fetch repos → select repo → fetch workflows + branches
3. Auto-fill: URL = `https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
4. Headers: `Authorization: Bearer <selected-token>`, `X-GitHub-Api-Version: 2022-11-28`, `Accept: application/vnd.github+json`
5. Method: POST
6. Body: `{"ref": "<selected-branch>", "inputs": {}}`

### Azure Pipeline Run
1. Select cron-job account → stored as `accountId`
2. Select Azure PAT → fetch projects → select project → fetch pipelines
3. Auto-fill: URL = `https://dev.azure.com/{org}/{project}/_apis/pipelines/{pipelineId}/runs?api-version=7.1`
4. Auth: Basic with `:<PAT>` base64-encoded
5. Method: POST
6. Body: `{"resources":{"repositories":{"self":{"refName":"refs/heads/main"}}}}`

---

## 6. Responsive Layout

- Max content width: `max-w-[1600px]` centered with `mx-auto`
- Padding: `p-container-padding` (CSS custom property)
- Gutter: `space-y-gutter` between sections
- Tables use `overflow-x-auto` wrapper for mobile
