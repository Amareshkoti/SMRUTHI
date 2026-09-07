# SMRUTI architecture

This document describes the current implementation. Line references are approximate and should be refreshed after large file moves.

## 1. High level

```text
Expo mobile app
  ├─ Supabase Auth and user-owned storage
  └─ Express API
       ├─ bearer-token verification
       ├─ in-memory PDF/image reading
       ├─ NVIDIA NIM extraction (report image -> JSON facts)
       └─ deterministic trend analysis (facts -> insights)
```

The uploaded file is decoded and processed in memory by the API. The API returns extracted facts; the mobile client stores those facts and report metadata in Supabase and an SQLite cache. The original file is not stored by this application.

Trend analysis is historical only. It needs three distinct dates, groups values by the exact report-printed analyte name plus unit, calculates a least-squares slope, and evaluates each value against that value's own printed reference range. It does not contain disease aliases, universal test thresholds, food rules, or future-value predictions.

## 2. Responsibilities and entry points

| Area | Responsibility | Main files |
|---|---|---|
| Mobile | UI, auth session, upload, cache, API calls | `mobile/App.tsx`, `mobile/src/api.ts` |
| API | Routes, validation, auth, pipeline | `server/src/app.ts`, `server/src/index.ts` |
| Extraction | PDF/image conversion and NIM calls | `server/src/pipeline.ts`, `server/src/nim/parse.ts`, `server/src/nim/extract.ts` |
| Analysis | Pure report-driven trend calculation | `server/src/health/trends.ts`, `shared/contracts.ts` |
| Persistence | RLS tables and atomic RPCs | `supabase/migrations/0001_init.sql`, `0003_atomic_records.sql` |
| Test data | Synthetic report generation | `samples/make_reports.py`, `output/pdf/` |

## 3. Request routing

### Startup

1. `server/src/index.ts` loads configuration, calls `assertConfigured()`, imports the Express `app`, and listens on the configured port.
2. `mobile/App.tsx` obtains the Supabase session, loads SQLite, refreshes Supabase data through `mobile/src/remote.ts`, then requests insights.
3. Navigation in `mobile/App.tsx` selects `HomeScreen`, `SignalScreen`, `MemoryScreen`, `AskScreen`, privacy, upload, and wipe views.

### Upload: file to stored facts

```text
AddReportSheet.pick/read()
  mobile/src/components/AddReportSheet.tsx
    -> readFileBase64()
    -> api.ingest()                         mobile/src/api.ts
    -> POST /api/ingest                     server/src/app.ts
       -> requireUser()                     server/src/auth.ts
       -> decodeUpload()                    server/src/upload.ts
       -> ingestUpload()                    server/src/pipeline.ts
          -> PDF pages or image preparation server/src/util/image.ts
          -> NIM parse                       server/src/nim/parse.ts
          -> NIM extraction                  server/src/nim/extract.ts
          -> schema validation/normalizing  server/src/schema.ts
    <- IngestedDocument
    -> pushDocument()                       mobile/src/remote.ts
       -> save_report RPC                   supabase/migrations/0003_atomic_records.sql
       -> SQLite cache                      mobile/src/db.ts
```

`decodeUpload()` checks the base64 envelope, size, and file signature. `pipeline.ts` hashes bytes only for a source identity; it does not write the bytes to disk.

### Trend analysis

```text
App facts
  -> api.insights()                         mobile/src/api.ts
  -> POST /api/insights                     server/src/app.ts
  -> FactsBody / HealthFactSchema           server/src/schema.ts
  -> detectTrends()                         server/src/health/trends.ts
     -> validate dates and numeric values
     -> group by measurementKey()            shared/contracts.ts
     -> remove conflicting same-day values
     -> require 3 distinct dates
     -> calculate slope and direction
     -> apply each report's printed range
  <- Insight[]
  -> HomeScreen / SignalScreen              mobile/src/screens/
```

The model is not called by `/api/insights`. `mobile/src/components/TrendChart.tsx` renders only the range and values returned by the server. It has no analyte map or future projection.

### Warning and question routes

`/api/warning` authenticates, recomputes insights, selects a warning, and formats a short message through `shared/messages.ts`. `/api/ask` authenticates, recomputes insights, and sends only the submitted facts, computed insights, and bounded recent history to `server/src/nim/answer.ts`. `server/src/nim/client.ts` is the only file that attaches the NVIDIA key. Model reasoning tags are stripped before a response is returned.

## 4. Data and security

- `documents` and `facts` are user-owned Supabase tables with forced RLS. Ask conversations are stored locally on the device and are not uploaded.
- The `save_report` RPC replaces one report's facts atomically under the authenticated user.
- The `erase_my_records` RPC deletes the user's documents and messages.
- The API validates the bearer token through Supabase Auth in `server/src/auth.ts`.
- Upload limits and accepted MIME types are shared by `shared/contracts.ts`, used by both API and mobile.
- Secrets come from environment variables; they are not sent to the mobile bundle.

## 5. Hardcoding audit

There are no analyte aliases, disease names, disease-specific food rules, universal medical thresholds, or time-to-threshold calculations in the analysis or UI code. `canonicaliseAnalyte()` only trims whitespace. Names and units from reports remain distinct.

The remaining constants are implementation or presentation values: API defaults, request limits, model defaults, route paths, UI copy, and synthetic demo data. Deployment overrides are supported in `server/src/config.ts` and `mobile/src/api.ts`; secrets are environment-backed. Synthetic examples intentionally mention concrete measurements because they are test fixtures, not production logic.

## 6. Verification

```text
cd server && npm exec -- tsc --noEmit -p tsconfig.json
cd ../mobile && npm exec -- tsc --noEmit -p tsconfig.json
cd ../server && npm test
```
