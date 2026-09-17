# E2E and reliability findings

Read-only baseline review followed by scoped reliability implementation. No paid provider request was made by this reviewer.

## Baseline findings

- Retry count was reset in memory after restart; retry overwrote the same generation record and remote task ID.
- Workflow restoration silently replaced corrupt JSON with CREATED; stale process locks had no recovery.
- Scheduler used current environment routing without comparing stored provider/model.
- Final recommendation could fabricate 88 points with no QC report; exhausted QC retry could mark a failed video completed.
- Existing provider-live script did not execute Pi or visual QC and could select a different provider from its CLI argument.
- Existing agent-run records inspected were Mock only. They are not evidence of real end-to-end success.

## Implemented safety primitives

- Durable submission intent without remote ID becomes MANUAL_VERIFICATION_REQUIRED; no automatic resubmission.
- Existing remote ID resumes polling/download; mismatched provider is rejected.
- Scheduler keeps distinct generation attempts, original remote IDs and per-attempt video archives; durable attempt count constrains retry budget.
- Invalid agent-run state fails closed. Lock release verifies its owner; dead-owner reclamation is serialized and requires ESRCH, never just elapsed time.
- Failed QC after the retry limit remains failed; only a completed, QC-passing result can be recommended.
- e2e-live accepts explicit real input paths, chooses Wan first, locks the task, selects only V1 and limits live retries to one. Final Pi/QC provenance acceptance is completed by the main integrator.

## Verification

`npx tsx --test tests/reliability.test.ts tests/provider.test.ts`: 16/16 PASS.

At handoff, typecheck was blocked only by old orchestrator QualityReport fixtures lacking newly required visual-QC fields; integration verification must rerun after fixture updates.

## Remaining integration checks

Pi tools must enforce these primitives too. A stored attempt must not be reset by an LLM tool request. Corrupt state, submission uncertainty and QC transport failures must never cause another paid submission. Keep real API provenance separate from deterministic tests. Product/model/first-frame assets must depict the intended same product for a fair fidelity assessment.

## Final Red Team fixes

- Missing generation-tasks.json now fails closed once production evidence exists; first-run initialization remains allowed only before production starts.
- Persisted generation attempts are Zod-validated, bound to the task and limited to attempts 0–2 with duplicate attempt IDs/numbers rejected.
- Pi catches provider/QC workflow errors, persists FAILED state, and continues through review and finalize_delivery; standalone refine calls are rejected unless the guarded scheduler owns the retry.
- Pi assistant message events now retain sanitized model/provider/response ID and token usage fields.
- Recovery prompts now start from the persisted provider/generation stage instead of replaying Director tools.
- Visual QC receives the actual duration-rescaled production timeline; review marks missing visual reports incomplete.
- 	ask.json and generation-tasks.json are compared before recovery, and /api/config exposes only its five approved public fields.