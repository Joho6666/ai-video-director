# Shot DNA and Variation Engine

## Shot DNA

Convert observations into a transferable directing grammar:

- `visual_purpose`: what the shot makes the viewer notice or feel.
- `emotion`: performance and viewing relationship.
- `camera_language`: qualitative spatial relationship and motion behavior.
- `product_display_logic`: when and how product silhouette, material, function, or detail becomes legible.
- `keep`: abstract intentions safe to retain.
- `mutate`: concrete structure that must change for the chosen mode.

Do not put the same item in both `keep` and `mutate`. In `INSPIRE`, concrete action order, camera path, entrance, and ending normally belong in `mutate`.

## Generate variations

Create the requested count (default 5). Give every concept a distinct dramatic verb and spatial idea. For each concept specify:

- hook and commercial purpose;
- camera height, trajectory, framing progression, and stability;
- subject entrance, trajectory, performance beat, and ending;
- environment interaction;
- product visibility moments;
- changed dimensions compared with the reference;
- a short reason it is not merely a scene swap.

Spread variation across the full set. Do not reuse one skeleton with cosmetic substitutions.

## Similarity Guard

For every reference-versus-concept and concept-versus-concept comparison, classify these dimensions as `low`, `medium`, or `high` similarity and explain in one sentence:

1. subject trajectory
2. camera trajectory
3. action sequence
4. framing
5. timing
6. composition

Rules:

- `INSPIRE`: reject and rewrite if 4+ dimensions are `high`, or fewer than 3 structural dimensions materially changed.
- `FUSION`: include a source map. Reject and recombine if one source supplies 4+ comparison dimensions.
- `RECREATE`: high similarity may pass, but label the risk and distinguish prompt-feasible approximation from motion-control requirements.

After a rewrite, report only the accepted concept plus a concise `rewrite_note`; do not expose discarded prompt drafts.
