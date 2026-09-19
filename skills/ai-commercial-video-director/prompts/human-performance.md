# Human Performance Layer

Translate mood words into playable, sequential behavior. Cover only body systems relevant to the shot, but never omit weight, gaze, expression, and secondary motion in a human-led shot.

## Direction fields

- `gait`: initiation foot when visible, cadence change, stride character, foot contact, stop/restart behavior.
- `body_weight`: support leg, center-of-mass travel, preparation before turns, settling after stops.
- `shoulders`: relaxation, counter-rotation, vertical variation, asymmetry.
- `arms` and `hands`: unequal swing, task-driven gesture, finger tension, contact/release.
- `gaze`: environmental focus, lens contact duration, lead/lag relative to head.
- `head_movement`: range, delay, recovery, relationship to shoulders and torso.
- `facial_expression`: onset, gradual change, peak, release; avoid binary switches.
- `breathing`: subtle chest/rib response only when visible and useful.
- `asymmetry`: one or two intentional left/right differences.
- `clothing_inertia`, `hair_inertia`, `props_inertia`: cause, lag, overshoot, settle.

## Anti-robot rules

- Never output only “walk naturally”, “smile”, “look confident”, or equivalents.
- A turn begins with attention or foot placement and weight transfer; the whole body does not rotate as one rigid block.
- Arm motion responds to gait and carried objects. A loaded arm normally swings less.
- Expression changes begin subtly and resolve gradually; avoid permanent lens contact.
- Secondary motion follows the primary action, may overshoot slightly, and settles after it.
- Use modest, physically compatible details. Too many micro-actions in a short shot reduce generation reliability.

Useful sequencing pattern when appropriate: `gaze → head → shoulders → torso → prop/clothing settle`. It is a directing principle, not a mandatory formula for every beat.

Always provide a matching negative-motion list, including only observed risks. Typical terms: robotic gait, perfectly symmetrical arm swing, frozen shoulders, foot sliding, abrupt pose switching, simultaneous eye-head-body rotation, instant smile, stiff fingers, weightless fabric, ignored prop inertia, sudden camera acceleration.
