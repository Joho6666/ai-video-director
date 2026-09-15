# AI Video Director — Implementation plan

## Scope and routing
Development; frontend, backend, video, orchestration; DEEP; MEDIUM risk.
Primary: none. Supporting: ai-commercial-video-director, frontend-design.
Providers: local shell/filesystem, browser for UI verification. No worktree: empty project directory. No subagents: implementation proceeds sequentially.
Verification: TypeScript, lint, production build, deterministic API/provider tests, real FFmpeg upload-to-three-playable-results smoke test, browser interaction/responsive review. Live model evaluation reported separately.

## Inspection
The supplied workspace contains no application repository. Create the project here, without modifying global configuration.
Existing Director is C:/Users/JOHO/.codex/skills/ai-commercial-video-director: SKILL.md, prompts/*.md, schemas/*.json, presets/*.json. It is an instruction bundle, not an executable SDK. Load this one source at runtime; validate its original output schema, then map to generation-plan.json. Do not change the skill.

## Ordered implementation
1. Next.js single-page dark studio: reference, model/product uploads, requirements, progress, three results.
2. Multipart upload validation and local JSON task persistence; ffprobe metadata, 16 FFmpeg frames and contact sheet.
3. AgentAdapter with Pi integration if packages are available; visual inputs plus original Director bundle, structured output validation. Explicit deterministic mock director for offline demos only.
4. VideoGenerationProvider: Seedance create/status/result plus local FFmpeg mock videos clearly labeled as previews.
5. Persist progress and generation plan, polling UI, playable/downloadable result cards and actionable failures.
6. Tests, production build, live local smoke test; README and architecture with exact boundaries.

## File inventory
Reuse read-only: existing Director SKILL.md, five prompt files, JSON schemas.
Create: package.json, tsconfig.json, next.config.ts, eslint.config.mjs, .env.example; app/layout.tsx, page.tsx, globals.css; app/api/tasks routes, media route, config route; packages/shared, director, agent, video-analysis, video-provider; scripts smoke tests; README.md and docs/architecture.md.
Modify: only newly created application files. Runtime artifacts under data/projects (gitignored).

## Truth boundaries
Mock footage is a local preview derived from the uploaded reference, not an AI-generated advertisement. Mock analysis marks visual observations unknown. A real Director run requires a configured vision model. Seedance calls require credentials and a compatible model; no paid generation during offline tests. No automatic QC, accounts, publishing, batch dashboard, or node editor.
