# Azure DevOps REST API Reference

**Base URL:** `https://dev.azure.com/{organization}`

**Auth:** Basic auth with `:` + PAT base64-encoded → `Authorization: Basic <base64(:PAT)>`

**API Version:** `api-version=7.1` (required query param on all requests)

---

## Key Endpoints

### List Projects
```
GET /_apis/projects?api-version=7.1
```
Returns: `{ "value": [{ "id": "guid", "name": "ProjectName", "state": "wellFormed" }] }`

### List Pipelines
```
GET /{project}/_apis/pipelines?api-version=7.1
```
Returns: `{ "value": [{ "id": 1, "name": "Build", "folder": "\\" }] }`

### Run Pipeline
```
POST /{project}/_apis/pipelines/{pipelineId}/runs?api-version=7.1
```
Body:
```json
{
  "resources": {
    "repositories": {
      "self": {
        "refName": "refs/heads/main"
      }
    }
  },
  "templateParameters": {}
}
```
Returns: `{ "id": 1, "state": "inProgress", ... }`

### Get Pipeline Run
```
GET /{project}/_apis/pipelines/{pipelineId}/runs/{runId}?api-version=7.1
```

### List Builds (Classic)
```
GET /{project}/_apis/build/builds?api-version=7.1
```

---

## PAT Scopes Required
- `Build (Read & execute)` — List and run pipelines
- `Project (Read)` — List projects

## Rate Limits
- Default: ~600 requests/minute per user
- 429 response if exceeded, includes `Retry-After` header

## Error Handling
- 401: Invalid or expired PAT
- 403: PAT lacks required scope
- 404: Project or pipeline not found
