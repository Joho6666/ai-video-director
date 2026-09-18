# Customer Demo Readiness Report

## Decision

**CUSTOMER DEMO NOT READY**

The deterministic workflow and recovery hardening are ready for review, but a real DeepSeek → Wan → MP4 → Visual QC run has not completed. The customer-facing demo must not present Mock output as a real generation result.

## Current baseline

- Repository: `Joho6666/ai-video-director`
- Branch: `main`
- Base commit before this hardening pass: `a6e72f3`
- Package version: `1.3.0`
- Working tree includes the hardening changes described in `DEMO_HARDENING_PLAN.md`.

## Preflight

`npm run demo:preflight` — **PASS**

- Node, FFmpeg and FFprobe available.
- Project and `data/` directories writable; disk check passed.
- DeepSeek configuration present without printing a key.
- Wan route resolved to `wanx2.1-i2v-plus`, 5 seconds, 720P.
- Golden Case assets are present locally and remain ignored by Git through `data/`.
- MiniMax configuration is `NOT_CHECKED` because the provider is not configured; this does not block the selected Wan route.
- Port 3080 is occupied by the local service, as expected for an in-place demo.
- Connectivity check is DNS-only and creates no paid task.

## Verification gates

| Check | Result |
|---|---|
| `npm test` | **PASS** — 78 tests |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |
| `npm run smoke` | **PASS** — 16 reference frames, 3 Mock results |
| `npm run provider-test` | **PASS** — 17 tests |
| `npm run pi-test` | **PASS** — 5 tests |
| `npm run quality-test` | **PASS** — 8 tests |
| `npm run benchmark:synthetic` | **PASS** — simulated framework only |
| `npm run demo:preflight` | **PASS** |
| GitHub Actions cloud run | **CI CONFIGURED BUT CLOUD RUN NOT VERIFIED** |

## Live rehearsal

`DEMO_REHEARSAL_REPORT.md` — **LIVE REHEARSAL = FAIL**

The fresh-build rehearsal reached the Director/Pi stage but the model request produced no usable response. The task was marked failed safely. No Wan creation request was submitted, so there is no real MP4, provider task ID, or passing visual QC to present.

- Real DeepSeek Director: **FAIL / unstable request**
- Wan paid generation: **NOT STARTED**
- MP4 download and FFprobe gate: **NOT TESTED**
- Visual QC: **NOT TESTED**
- Retry: **NOT_REQUIRED** (no eligible evidence-backed video defect existed)
- Replay fallback: **UNAVAILABLE** (no completed verified real task exists)
- Real Benchmark: **NOT YET VERIFIED**

## Hardening delivered

- Durable benchmark generation intent and remote task ledger; ambiguous submissions never resubmit.
- Provider duration/model/resolution values are taken from the resolved route, and production prompts use the same route duration.
- Direct task-detail requests start pending-task recovery after a process restart.
- Persisted generation tasks resume through the guarded Scheduler without another Director/Pi planning call; existing remote IDs are polled only.
- Customer UI/API errors map provider and transport details to actionable Chinese messages while retaining only sanitized task logs.
- Preflight, Golden Case, live rehearsal and verified replay entry points are available.

## Safe demo instructions

1. Run `npm run demo:preflight`; stop if any P0 check is `FAIL`.
2. For a no-cost walkthrough, use `APP_MODE=mock` and keep the visible `DEMO ONLY` label.
3. For a real run, use `npm run demo:live` only after confirming the DeepSeek/Wan service is reachable and authorized assets are valid. It submits one V1 and uses the durable ledger.
4. Use `npm run demo:replay -- <completed-real-task-id>` only when the task passed the real MP4 and QC gates; the UI must show `Verified Previous Run / 已验证历史任务`.

## Remaining blockers and risks

- A real Director response and a successful Wan video have not been verified in this environment.
- No verified replay asset is available if the external services fail during the customer session.
- VFR timestamp precision remains a known analysis limitation from the prior release.
- GitHub Actions is configured for non-paid checks, but its cloud result has not been observed from this workspace.

No API key, Authorization header, signed URL, customer media, MP4, quality frame, benchmark run, or absolute local path is recorded in this report.
