# Ksense assessment overview by Jaimin Savaliya

I used **Next.js 15 + TypeScript**. The app fetches patient data from the DemoMed API, parses and normalises the data defensively, computes risk scores, and submits alert lists back to the API.

> **Why Next.js frontend?** The job description asked for Next.js, so I created interactive frontend dashboard (Took AI's help) to give a visual interface to run the pipeline, inspect raw data, review scores.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Frontend dashboard (client component)
│   └── api/
│       ├── patients/route.ts   # Full pipeline endpoint
│       ├── submit/route.ts     # Submission endpoint
│       └── inspect/route.ts   # Raw data inspection endpoint
└── lib/
    ├── config.ts               # API key, base URL, retry settings
    ├── types.ts                # TypeScript interfaces
    ├── fetcher.ts              # Pagination + retry/rate-limit logic
    ├── parser.ts               # Defensive field parsing + quality tagging
    ├── scoring.ts              # BP / temperature / age risk scoring
    └── alerts.ts               # Alert list generation
```

## Flow to maintain SOLID principals
```
DemoMed API
    │
    ▼
fetcher.ts          ← pagination + retry/rate-limit handling
    │
    ▼
parser.ts           ← defensive field extraction + data quality tagging
    │
    ▼
scoring.ts          ← BP / temperature / age risk scoring
    │
    ▼
alerts.ts           ← high_risk / fever / data_quality lists
    │
    ▼
POST /api/submit    ← submits SubmissionPayload to DemoMed
```
---

## How API Behaviours Are Handled

Because it is a demo, API_key is stored in config file so recruiter can easily clone and run the project. In real world, I would save keys in .env

The DemoMed API has four documented failure modes. Each is explicitly handled in `src/lib/fetcher.ts`.



### 1. Rate Limiting — HTTP 429

When the API returns a 429 response:

- The `Retry-After` response header is read. If present, the fetcher sleeps for exactly that duration before retrying.
- If no `Retry-After` header is present, exponential backoff with jitter kicks in (same as server errors below).
- After the Retry-After sleep, the next iteration skips the additional backoff delay to avoid double-waiting.

```
429 received
  └─ Retry-After header present?
       ├─ Yes → sleep(retryAfterMs), skip backoff on next attempt
       └─ No  → fall through to exponential backoff
```

### 2. Intermittent Server Errors — HTTP 500 / 503

Both 500 and 503 responses are treated as transient and retried automatically:

- **Exponential backoff**: `delay = INITIAL_BACKOFF_MS × 2^(attempt-1)`
- **Jitter**: ±50% randomisation on every delay to prevent thundering-herd when multiple requests retry simultaneously
- **Cap**: Maximum 30 seconds between retries
- **Limit**: Up to `MAX_RETRIES` attempts (configured in `config.ts`); throws after exhaustion

Any other non-2xx response (e.g. 401, 404) is treated as a permanent failure and throws immediately without retrying.

### 3. Pagination

The API returns 5 patients per page by default. The fetcher requests pages sequentially using `limit=20` to reduce round trips, and continues until one of the following signals stop:

| Signal | Description |
|--------|-------------|
| `pagination.hasNext === false` | Explicit stop signal (most reliable) |
| `pagination.totalPages` reached | Inferred from total pages when `hasNext` is absent |
| Empty page returned | Last-resort fallback when no pagination metadata is present |
| Safety cap (20 pages) | Hard stop to prevent infinite loops |

The fetcher also handles **inconsistent pagination field names** — it checks both `hasNext` and `has_next`, and both `totalPages` and `total_pages`.

Patient records are **deduplicated by `patient_id`** across pages in case of overlapping responses.

### 4. Inconsistent Response Shapes

The API occasionally returns patient arrays under different keys. `extractPatients()` tries each known shape in order:

```
{ data: [...] }       ← canonical shape
{ patients: [...] }   ← alternate shape
[...]                 ← root-level array
```

If none match, an empty array is returned and a warning is logged rather than crashing the pipeline.

---

## Data Quality Issues & How They Are Handled

Real-world patient data from the API is frequently malformed. The parser (`src/lib/parser.ts`) handles every known failure mode and tags affected records rather than discarding them.

### Issues Found in the Data

| Field | Issues Observed | How Handled |
|-------|----------------|-------------|
| **patient_id** | Missing or null | Generates placeholder `UNKNOWN_<index>`, flags `'missing patient_id'` |
| **blood_pressure** | `"150/"` (missing diastolic) | Systolic parsed, diastolic → `null` → BP score = 0 |
| **blood_pressure** | `"/90"` (missing systolic) | Diastolic parsed, systolic → `null` → BP score = 0 |
| **blood_pressure** | `"INVALID"`, `"N/A"`, non-numeric strings | Both values → `null` → BP score = 0 |
| **blood_pressure** | `null`, `undefined`, empty string | Both values → `null` → BP score = 0 |
| **temperature** | `"TEMP_ERROR"`, `"invalid"` | → `null` → temp score = 0 |
| **temperature** | `null`, `undefined`, empty string | → `null` → temp score = 0 |
| **age** | `"fifty-three"`, `"unknown"` | → `null` → age score = 0 |
| **age** | `null`, `undefined` | → `null` → age score = 0 |
| **name** | Missing | Defaults to `'Unknown'` |

### Tagging Strategy

Every parsed patient carries two fields:

```ts
hasDataQualityIssue: boolean     // true if any field failed parsing
dataQualityReasons: string[]     // e.g. ['invalid/missing BP', 'invalid/missing age']
```

This means no patient record is silently dropped. Records with bad data are still scored (with 0 for the affected dimension) and appear in the `data_quality_issues` alert list for human review.

### Temperature Spec Warning

The scoring spec contains **hidden Unicode RTL (right-to-left) override characters** in the high-fever threshold, making `101.0` appear visually reversed in some editors. The threshold is hardcoded as the literal value `101.0` in `scoring.ts` — not copy-pasted from the spec — to avoid this trap.

---

## Scoring Logic

Total Risk Score = BP Score + Temperature Score + Age Score

### Blood Pressure

| Stage | Criteria | Points |
|-------|----------|--------|
| Normal | Systolic < 120 AND Diastolic < 80 | 1 |
| Elevated | Systolic 120–129 AND Diastolic < 80 | 2 |
| Stage 1 | Systolic 130–139 OR Diastolic 80–89 | 3 |
| Stage 2 | Systolic ≥ 140 OR Diastolic ≥ 90 | 4 |
| Invalid/Missing | Either value is null | 0 |

**When systolic and diastolic fall into different stages, the higher stage is used.** For example, systolic 125 (Elevated) + diastolic 85 (Stage 1) → Stage 1 (3 points).

The "Elevated" category is special: it only applies when systolic is 120–129 **and** diastolic is below 80. If diastolic is 80 or above, the Elevated stage is cancelled and diastolic's stage wins instead.

---

## Alert System

Three alert lists are generated from the scored patient set (`src/lib/alerts.ts`):

| Alert | Criteria |
|-------|----------|
| `high_risk_patients` | `totalScore >= 4` |
| `fever_patients` | Temperature is a **valid number** AND `>= 99.6°F` |
| `data_quality_issues` | Any field is missing or malformed (`hasDataQualityIssue === true`) |

All lists are sorted alphabetically by patient ID before submission.

**Note on fever alerts:** Patients with a null or unparseable temperature are placed only in `data_quality_issues` — not in `fever_patients`. A fever cannot be confirmed without a valid reading.

---

## Frontend Dashboard

Since the role required Next.js, a full interactive frontend was built in `src/app/page.tsx` on top of the core pipeline.

### Features

**Controls**
- **Inspect Raw Data** — Fetches the first raw page from the API and displays it as JSON, before any parsing or scoring. Useful for seeing exactly what the API returns.
- **Run Pipeline** — Executes the full fetch → parse → score → alert pipeline and displays results.
- **Submit Assessment (just for me to easily make a post request)** — Runs the pipeline and POSTs the alert payload to DemoMed, showing their feedback response.

**Summary Cards**
Four metric cards showing total patients, high-risk count, fever count, and data quality issue count.

**Alert Lists**
Three columns showing the patient IDs in each alert category with scrollable lists and counts.

**Patient Table**
Full scored patient table with columns for all fields and scores. Supports:
- Text search by patient ID or name
- Filter tabs: ALL / HIGH (score ≥ 4) / MED (score 2–3) / LOW (score < 2)
- Red row highlights for high-risk patients
- Orange temperature values for fever patients
- Yellow data quality warnings with reasons listed


---

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use the **Run Pipeline** button to fetch and score all patients. Submit button was just for myself to make it easier to make post request
