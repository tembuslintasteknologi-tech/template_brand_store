# Load test (k6)

Target from the checklist: p95 under 200ms at 10.000 concurrent users.

## Status

The script exists and the thresholds are declared. The run has **not** been executed yet,
because it needs an environment with Postgres, Redis, and enough client capacity to push
10.000 virtual users. A laptop running the API and k6 on the same machine measures itself,
not the API.

## Run it

```bash
# smoke: 10 VUs for 30s, safe on staging
k6 run loadtest/k6-smoke.js

# SLA run: ramps to 10.000 VUs for 5 minutes at peak
BASE_URL=https://staging.example.com k6 run -e SCENARIO=load loadtest/k6-smoke.js
```

## What must be recorded for the row to close

1. The command line used, including `BASE_URL` and `SCENARIO`.
2. The k6 summary block showing `http_req_duration p(95)` and `p(99)`.
3. The API host spec (vCPU, RAM) and the k6 host spec, because a client bottleneck reads
   as an API bottleneck in the summary.
4. Database and Redis connection counts during the peak, so pool exhaustion is visible.

## Thresholds in the script

| Metric | Threshold |
| --- | --- |
| `http_req_duration` | p95 < 200ms, p99 < 500ms |
| `http_req_failed` | rate < 1% |
| `business_failures` | rate < 1% |
| `product_list_duration` | p95 < 200ms |

`business_failures` counts a 200 response with `success: false`, which the HTTP-level failure
rate would otherwise miss.

## Known caveat

`GET /api/v1/products` applies cursor pagination, so each request reads at most `limit + 1`
rows. Without an index on `(created_at, id)` the query still sorts the whole published set,
and the p95 target will not hold at 10.000 VUs. Verify the plan before trusting a pass.
