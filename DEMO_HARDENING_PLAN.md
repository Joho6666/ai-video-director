# AI Video Director Customer Demo Hardening Plan

## Baseline

- Commit: `a6e72f3` (`Add real benchmark validation and reliability hardening`)
- Package version: `1.3.0`
- Branch: `main`, synchronized with `origin/main`
- Scope: reliability, durable paid-task recovery, demo preflight, replay, and customer-facing failure handling.

## P0 findings

1. Real Benchmark generation used an empty persistence callback, so a process crash could lose submission state and permit a duplicate paid request.
2. Real Benchmark duplicated `720P`, `9:16`, and an eight-second Director prompt instead of using the resolved provider route.
3. There was no deterministic customer-demo preflight, Golden Case, or live/replay entry point.
4. UI surfaced raw provider errors and did not distinguish safe remote-task recovery from a new submission.
5. Existing local Wan tasks are failed; no verified successful real run is available for replay at baseline.

## Frozen boundaries

This hardening pass does not add providers, agents, benchmark categories, TTS, batch production, SaaS, HyperFrames, Hypit, Jianying, or a UI redesign. Mock remains explicitly demo-only and is never used to claim a live result.

## Acceptance

All existing gates and the new ledger, route-duration, preflight, replay, and customer-error tests must pass. A live rehearsal is reported as `UNAVAILABLE` unless DeepSeek, Wan, and Golden Case assets are all valid and a real MP4 passes download and QC gates.
