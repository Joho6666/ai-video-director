---
name: ai-commercial-video-director
description: Analyze commercial reference videos, extract reusable shot language, redesign differentiated shots, direct continuous human performance, and compile prompts for Google Flow/Veo or Seedance. Use for fashion and human-led advertising; not for exact motion transfer or model training.
---

# AI Commercial Video Director

Turn references into new directing decisions, not disguised copies. Default to `INSPIRE`, explain the directing analysis in Chinese, and write generation prompts in English.

## Intake

Normalize the request against [schemas/input.schema.json](schemas/input.schema.json). Ask only for information that materially changes the result. Mark observations that cannot be verified as `unknown`; put creative assumptions in `assumptions`. Never invent exact focal lengths, camera heights, angles, or timing from ambiguous footage.

Modes:

- `INSPIRE`: preserve visual purpose, mood, camera language, and product-display logic; redesign the shot structure.
- `RECREATE`: permit close structural reference, disclose similarity and prompt-control limits, and recommend reference-video or motion-control workflows when precision is required.
- `FUSION`: assign each reference one or more roles (`motion`, `camera`, `composition`, `scene`) and disclose the source map.

## Workflow

1. Read [prompts/reference-analyzer.md](prompts/reference-analyzer.md) and describe only visible or supplied evidence.
2. Read [prompts/shot-dna-and-variation.md](prompts/shot-dna-and-variation.md). Separate `KEEP` from `MUTATE`, then produce the requested number of structurally distinct concepts (default 5).
3. Read [prompts/human-performance.md](prompts/human-performance.md) for every human-led concept.
4. Read [prompts/motion-continuity.md](prompts/motion-continuity.md). Build a timeline in which each segment inherits or explicitly transitions from the preceding end state.
5. Run the similarity guard before compiling prompts. Rewrite a failed concept; do not merely rename it or change the location.
6. Read [prompts/prompt-compiler.md](prompts/prompt-compiler.md) only for the requested target models.
7. Return a human-readable director treatment plus structured data matching [schemas/output.schema.json](schemas/output.schema.json).

Use [presets/fashion.json](presets/fashion.json) and [presets/shot-library.json](presets/shot-library.json) as idea boundaries, not mandatory templates. Read the examples only when a concrete pattern is useful.

## Non-negotiable quality gates

- Describe performance as change over time. Words such as “natural”, “confident”, or “smiling” are invalid unless supported by observable body, gaze, expression, timing, and weight-shift instructions.
- Stagger reactions when appropriate: gaze leads, then head, shoulders, and torso. Do not rotate all parts simultaneously.
- Include asymmetry and relevant clothing, hair, or prop inertia without overloading the shot.
- Keep the camera path and subject path physically compatible. Avoid unexplained teleportation, foot sliding, pose switching, or camera acceleration.
- In `INSPIRE`, materially change at least 3 of: camera height, camera trajectory, subject trajectory, framing, performance, entrance, ending, environment interaction.
- Compare each concept with every reference and with sibling concepts across subject trajectory, camera trajectory, action sequence, framing, timing, and composition.
- `INSPIRE` fails when 4 or more similarity dimensions remain high, or fewer than 3 structural dimensions change. `FUSION` fails when one source dominates 4 or more comparison dimensions. `RECREATE` may pass with high similarity only when the report flags it.
- If the requested action density cannot be expressed as continuous motion in one shot, split it into shorter shots and explain why.

## Boundaries

This skill produces analysis, directing specifications, and prompts. It does not train models, extract pose/depth, perform optical-flow comparison, execute paid generations, or promise frame-accurate motion transfer. State these limits whenever the user requests exact replication.
