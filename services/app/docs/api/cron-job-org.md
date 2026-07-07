# Cron-Job.org API Reference

**Base URL:** `https://api.cron-job.org`

**Auth:** `Authorization: Bearer <api-key>` header

---

## Endpoints

### List Jobs
```
GET /jobs
```
Response: `{ "jobs": [{ "jobId": 123, "title": "...", "url": "...", "enabled": true, ... }] }`

### Get Job
```
GET /jobs/{jobId}
```

### Create / Update Job
```
PUT /jobs
```
Body:
```json
{
  "job": {
    "title": "My Job",
    "url": "https://example.com/webhook",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 0,
    "schedule": {
      "timezone": "Asia/Bangkok",
      "hours": [9],
      "mdays": [1],
      "wdays": [],
      "minutes": [0]
    },
    "requestHeaders": [{ "name": "Authorization", "value": "Bearer xxx" }]
  }
}
```
`requestMethod`: 0=GET, 1=POST, 2=PUT, 3=DELETE, 4=PATCH, 5=HEAD

### Partial Update Job
```
PATCH /jobs/{jobId}
```

### Delete Job
```
DELETE /jobs/{jobId}
```

### Job History
```
GET /jobs/{jobId}/history
```
Response: `{ "history": [{ "jobId": 123, "date": "...", "duration": 500, "statusCode": 200, "status": "ok" }] }`

### Folders
```
GET /folders
```

---

## Schedule Object

| Field | Type | Description |
|-------|------|-------------|
| timezone | string | IANA timezone |
| minutes | number[] | 0-59 |
| hours | number[] | 0-23 |
| mdays | number[] | 1-31 |
| wdays | number[] | 0-6 (0=Sunday) |
| months | number[] | 1-12 |

Empty array = "every" (e.g. `hours: []` = every hour).

---

## Rate Limits
- 3 requests/second for authenticated users
- 429 response if exceeded

## Error Handling
- 401: Invalid or missing API key
- 404: Job not found
- 422: Validation error in job config
