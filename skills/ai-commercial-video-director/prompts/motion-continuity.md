# Motion Continuity Engine

Build one timeline per concept. Use seconds when total duration is known; otherwise use relative beats and mark timing as an assumption.

Every segment must include:

- `start_state`
- `transition`
- `end_state`
- `duration`
- `body_weight`
- `gaze`
- `facial_expression`
- `arm_motion`
- `secondary_motion`

Also record `segment_id`, `time_range`, `camera_state`, and `subject_position` when available.

## Continuity contract

For adjacent segments, the previous `end_state` must equal the next `start_state` in all material respects, or the next `transition` must explicitly bridge the difference. Check:

- screen position and facing direction;
- support leg and center of mass;
- walking/stopped cadence;
- gaze target and head orientation;
- expression intensity;
- hand/prop contact;
- clothing, hair, and prop momentum;
- camera position, velocity, and framing.

Never reset the actor to a neutral pose between beats. Never allow a prop to change hands, a foot to become planted, or a camera to reverse direction without a described transition.

## Density gate

Prefer 2–4 readable beats for a 4–8 second shot. If actions require incompatible states, simultaneous attention targets, or more transitions than the duration can show, split the concept into multiple shots. Preserve the outgoing state as the next shot's first-frame recommendation when continuity is desired.

Finish with `continuity_check: pass | revise` and list any bridged discontinuities. A `revise` timeline cannot proceed to prompt compilation.
