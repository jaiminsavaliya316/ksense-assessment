import { CONFIG } from './config';
import type { RawPatient } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with automatic retry for transient errors.
 *
 * - 429 (rate-limited): respects Retry-After header, falls back to backoff
 * - 500/503 (server error): exponential backoff + jitter
 * - Other 4xx: throws immediately (no retry — permanent failure)
 * - Network errors: exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = CONFIG.MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  // When a 429 Retry-After sleep has already been applied, skip the
  // additional exponential backoff that fires at the top of the next iteration.
  let skipNextBackoff = false;

  // Log the exact request on the first attempt for diagnostics
  console.log(`[fetcher] → ${options.method ?? 'GET'} ${url} | key: ${CONFIG.API_KEY.slice(0, 8)}…`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Apply exponential backoff before every retry — but not if we already
    // slept for a 429 Retry-After duration (that would double the wait).
    if (attempt > 0) {
      if (skipNextBackoff) {
        skipNextBackoff = false;
        console.log(`[fetcher] Attempt ${attempt + 1}/${maxRetries + 1} — skipping backoff (already waited for Retry-After)`);
      } else {
        const baseDelay = CONFIG.INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        const jitter = baseDelay * (0.5 + Math.random()); // ±50% jitter
        const delay = Math.min(jitter, 30_000);
        console.log(
          `[fetcher] Attempt ${attempt + 1}/${maxRetries + 1} — waiting ${Math.round(delay)}ms before retry…`
        );
        await sleep(delay);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'x-api-key': CONFIG.API_KEY,
          // Only set Content-Type when there's a request body (POST/PUT).
          // Sending Content-Type on GET requests is malformed and causes
          // some API servers to return 500.
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        cache: 'no-store',
      });
    } catch (networkError) {
      lastError = new Error(`Network error: ${String(networkError)}`);
      console.warn(`[fetcher] Network error on attempt ${attempt + 1}: ${lastError.message}`);
      continue; // retry
    }

    // 429 — Rate limited
    if (response.status === 429) {
      if (attempt >= maxRetries) {
        throw new Error(`Rate limited (429) — exhausted ${maxRetries + 1} attempts`);
      }
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      if (retryAfterMs && !isNaN(retryAfterMs)) {
        // Sleep the Retry-After duration now; signal next iteration to skip backoff
        console.warn(`[fetcher] 429 rate-limited — sleeping ${retryAfter}s (Retry-After)`);
        await sleep(retryAfterMs);
        skipNextBackoff = true;
      } else {
        // No Retry-After — let the backoff at the top of the next iteration handle it
        console.warn(`[fetcher] 429 rate-limited on attempt ${attempt + 1} — using backoff`);
      }
      lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
      continue;
    }

    // 500 / 503 — Transient server error
    if (response.status === 500 || response.status === 503) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      console.warn(`[fetcher] Server error (${response.status}) on attempt ${attempt + 1} for ${url}\nBody: ${body}`);
      lastError = new Error(`Server error ${response.status}: ${body}`);
      continue; // retry with backoff
    }

    // Any other non-2xx — permanent failure, do not retry
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} for ${url}`
      );
    }

    return response; // success
  }

  throw new Error(
    `Failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message ?? 'unknown'}`
  );
}

/**
 * Extract the RawPatient array from an API response body.
 * Handles inconsistent response shapes by trying multiple known keys.
 */
function extractPatients(body: unknown): RawPatient[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;

  // Canonical shape: { data: [...] }
  if (Array.isArray(b.data)) return b.data as RawPatient[];

  // Fallback shape: { patients: [...] }
  if (Array.isArray(b.patients)) return b.patients as RawPatient[];

  // Root-level array
  if (Array.isArray(body)) return body as RawPatient[];

  console.warn('[fetcher] Unexpected response shape — could not find patient array:', b);
  return [];
}

/**
 * Fetch all patients across all pages sequentially.
 * Uses limit=20 to minimise round trips.
 * Deduplicates by patient_id in case pages overlap.
 */
export async function fetchAllPatients(): Promise<RawPatient[]> {
  const allPatients: RawPatient[] = [];
  const seenIds = new Set<string>();
  let page = 1;
  const SAFETY_CAP = 20;

  while (true) {
    const url = `${CONFIG.BASE_URL}${CONFIG.PATIENTS_ENDPOINT}?page=${page}&limit=${CONFIG.PAGE_LIMIT}`;
    console.log(`[fetcher] Fetching page ${page}…`);

    const response = await fetchWithRetry(url);
    const body = await response.json() as unknown;

    const patients = extractPatients(body);
    const bodyObj = body as Record<string, unknown>;

    // Deduplicate
    for (const p of patients) {
      const id = p.patient_id;
      if (id && seenIds.has(id)) {
        console.warn(`[fetcher] Duplicate patient_id "${id}" on page ${page} — skipping`);
        continue;
      }
      if (id) seenIds.add(id);
      allPatients.push(p);
    }

    // Determine whether to continue paginating.
    // The API may return inconsistent shapes, so we check in order:
    //   1. Explicit hasNext boolean (most reliable)
    //   2. totalPages comparison (fallback when hasNext is absent)
    //   3. Empty data array (last resort — API ran out of records)
    const pagination = bodyObj.pagination as Record<string, unknown> | undefined;

    const hasNextFlag: boolean | undefined =
      typeof pagination?.hasNext === 'boolean' ? pagination.hasNext :
      typeof pagination?.has_next === 'boolean' ? pagination.has_next :
      typeof bodyObj.hasNext === 'boolean' ? bodyObj.hasNext :
      undefined; // field missing — don't trust it

    const totalPages: number | undefined =
      typeof pagination?.totalPages === 'number' ? pagination.totalPages :
      typeof pagination?.total_pages === 'number' ? pagination.total_pages :
      typeof bodyObj.totalPages === 'number' ? bodyObj.totalPages :
      undefined;

    const morePages =
      hasNextFlag === true ||                               // explicit signal
      (hasNextFlag === undefined && totalPages !== undefined && page < totalPages) || // inferred
      (hasNextFlag === undefined && totalPages === undefined && patients.length > 0 && page < SAFETY_CAP); // no metadata at all — keep going

    if (!morePages || patients.length === 0) {
      console.log(`[fetcher] Pagination complete at page ${page}.`);
      break;
    }

    if (page >= SAFETY_CAP) {
      console.warn(`[fetcher] Safety cap reached at page ${SAFETY_CAP} — stopping.`);
      break;
    }

    page++;
  }

  console.log(`[fetcher] Total patients fetched: ${allPatients.length}`);
  return allPatients;
}
