# AI Video Director v1.1 Real E2E

## 1. Test environment

- Task: `0dfb9a16-c183-4f0c-acab-973868506863`
- Mode: `full` (DeepSeek Director + Pi Runtime + Wan)
- Provider/model: `wan` / `wanx2.1-i2v-plus`
- Selected versions: V1 only
- Director model: `deepseek-flash`
- Input hashes: reference `f8e6ad4397018f607e47498d588769878774a475fa5644ad22a9c770dcdcbb9c`, model `efc48498196c8b2acb33863cea513cf967af994505a3d448639f186eb68687c2`, product `5e404413367c5d3734260ee23545b5f48b028e517e3729262a412a3d0160b9cc`, first frame `8afc42310c582e95ee30d178b2b66629fac30b85baea3f92e1239d57e0348cf3`
- Material provenance: technical closure only. The first frame was derived from the reference video; public authorization and same-source product provenance were not supplied.

## 2. Pipeline

| Stage | Result |
|---|---|
| Director plan | PASS |
| Pi Runtime | FAIL |
| Wan submission | PASS (submitted once) |
| Wan query/download | FAIL |
| Visual QC | NOT_TESTED |
| Quality gate | NOT_TESTED |
| Final MP4 | FAIL |
| REAL_E2E | FAIL |

The Director call produced and persisted `director-output.json`, `reference-evidence.json`, `generation-plan.json`, `runtime.json` and the sanitized export package. Wan accepted one request and returned a remote task ID; status polling failed with `Wan query connection failed`. The saved attempt remains failed with its remote ID, so no second submission was made.

## 3. Pi audit

- Observed tool events: 5
- Sequence: `analyze_reference → build_director_plan → select_video_provider → generate_video → review_video`
- `finalize_delivery`: NOT_TESTED in this historical run (the runtime fix was applied afterward and covered by deterministic Pi tests).
- Model event records contain only sanitized IDs, statuses and bounded result summaries.

## 4. Visual QC

- Evaluation mode: NOT_TESTED
- Generated QC frames/contact sheet: NOT_TESTED
- Evidence and score: NOT_TESTED
- Retry: NOT_REQUIRED (no video reached QC; no paid retry was attempted)

## 5. Persisted artifacts

- Director artifacts: PASS
- Runtime: PASS
- Agent audit: PASS
- Export whitelist: PASS
- Generated MP4: FAIL

## 6. Acceptance boundary and next step

This is a failed technical live run, not a `v1.1 COMPLETE` result. Because the provider query failed after a remote task ID was recorded, the safe next step is manual provider verification or a later status recovery using the same ID; automatic resubmission is forbidden. A customer-level product fidelity or authorization claim cannot be made from these assets.

The report contains hashes and sanitized summaries only. It contains no credentials, Authorization headers, absolute source paths, raw provider responses, signed URLs or customer media.
