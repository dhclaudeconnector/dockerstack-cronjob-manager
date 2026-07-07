# GitHub Actions REST API Reference

**Base URL:** `https://api.github.com`

**Auth:** `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `Accept: application/vnd.github+json`

---

## Key Endpoints

### Authenticated User
```
GET /user
```
Returns: `{ "login": "username", "id": 123, ... }`

### List User Repositories
```
GET /user/repos?per_page=100&sort=updated
```
Returns: `[{ "id": 1, "name": "repo", "full_name": "owner/repo", "private": false, ... }]`

### List Repository Workflows
```
GET /repos/{owner}/{repo}/actions/workflows
```
Returns: `{ "workflows": [{ "id": 123, "name": "CI", "path": ".github/workflows/ci.yml", "state": "active" }] }`

### List Repository Branches
```
GET /repos/{owner}/{repo}/branches
```
Returns: `[{ "name": "main", "protected": true }]`

### Dispatch Workflow
```
POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
```
Body:
```json
{
  "ref": "main",
  "inputs": { "key": "value" }
}
```
Returns: 204 No Content on success.

### List Workflow Runs
```
GET /repos/{owner}/{repo}/actions/runs?workflow_id={id}
```

---

## Token Scopes Required
- `repo` — Full control of private repositories
- `workflow` — Update GitHub Action workflows

## Rate Limits
- Authenticated: 5,000 requests/hour
- `X-RateLimit-Remaining` header shows remaining

## Error Handling
- 401: Bad token
- 403: Rate limit or insufficient scope
- 404: Repo or workflow not found
