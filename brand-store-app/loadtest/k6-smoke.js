// k6 load test for the brand-store API.
//
// Two scenarios:
//   smoke  short sanity run, safe to point at staging on every deploy
//   load   the SLA run: p95 under 200ms while ramping to 10.000 virtual users
//
// Run:
//   k6 run loadtest/k6-smoke.js                        # smoke only
//   k6 run -e SCENARIO=load loadtest/k6-smoke.js       # full SLA run
//   BASE_URL=https://staging.example.com k6 run ...
//
// The 10.000 user target is a ramp, not a spike. If the environment has fewer than about
// 4 vCPU it will hit the threshold on the client side before the API does, so record the
// machine spec next to the result.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'smoke';

const failures = new Rate('business_failures');
const productListDuration = new Trend('product_list_duration');
const bannerListDuration = new Trend('banner_list_duration');

export const options =
  SCENARIO === 'load'
    ? {
        scenarios: {
          ramp: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '2m', target: 500 },
              { duration: '3m', target: 2000 },
              { duration: '3m', target: 10000 },
              { duration: '5m', target: 10000 },
              { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '30s',
          },
        },
        thresholds: {
          http_req_duration: ['p(95)<200', 'p(99)<500'],
          http_req_failed: ['rate<0.01'],
          business_failures: ['rate<0.01'],
          product_list_duration: ['p(95)<200'],
        },
      }
    : {
        scenarios: {
          smoke: {
            executor: 'constant-vus',
            vus: 10,
            duration: '30s',
          },
        },
        thresholds: {
          http_req_duration: ['p(95)<200'],
          http_req_failed: ['rate<0.01'],
          business_failures: ['rate<0.01'],
        },
      };

function json(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });
  failures.add(health.status !== 200);

  const products = http.get(`${BASE_URL}/api/v1/products?limit=20`, {
    tags: { endpoint: 'products_list' },
  });
  productListDuration.add(products.timing.duration);
  const productBody = json(products);
  check(products, {
    'products 200': (r) => r.status === 200,
    'products envelope': () => productBody?.success === true,
    'products page metadata': () => typeof productBody?.page?.limit === 'number',
  });
  failures.add(products.status !== 200 || productBody?.success !== true);

  const banners = http.get(`${BASE_URL}/api/v1/banners`, {
    tags: { endpoint: 'banner_list' },
  });
  bannerListDuration.add(banners.timing.duration);
  check(banners, { 'banners 200': (r) => r.status === 200 });
  failures.add(banners.status !== 200);

  sleep(1);
}
