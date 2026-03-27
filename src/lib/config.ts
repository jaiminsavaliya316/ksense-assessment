export const CONFIG = {
  API_KEY: 'ak_ec0769909d1da8040e40f7b4f032e9f0454831a0a01fc63b',
  BASE_URL: 'https://assessment.ksensetech.com/api',
  PATIENTS_ENDPOINT: '/patients',
  SUBMIT_ENDPOINT: '/submit-assessment',
  PAGE_LIMIT: 20,          // max allowed per page, minimizes total requests
  MAX_RETRIES: 5,
  INITIAL_BACKOFF_MS: 1000, // doubles each retry: 1s, 2s, 4s, 8s, 16s
} as const;
