# Test Case 03 — FUSION source-map test

## Synthetic input

```json
{
  "mode": "FUSION",
  "references": [
    {"id": "ref-a", "type": "text-analysis", "source": "relaxed staggered gaze-to-turn performance", "roles": ["motion"]},
    {"id": "ref-b", "type": "text-analysis", "source": "low lateral camera track ending in a restrained arc", "roles": ["camera"]},
    {"id": "ref-c", "type": "image", "source": "architectural-atrium.jpg", "roles": ["composition", "scene"]}
  ],
  "product": {"name": "structured coat", "category": "fashion", "selling_points": ["clean shoulder", "fluid hem"], "must_show": ["front silhouette", "back drape"]},
  "subject": {"description": "single adult model", "props": []},
  "creative_brief": {"platform": "social feed", "commercial_goal": "premium silhouette reveal", "aspect_ratio": "9:16", "duration_seconds": 7},
  "target_models": ["google-flow-veo", "seedance"],
  "variation_count": 5
}
```

## Expected source map

- motion ← `ref-a`
- camera ← `ref-b`
- composition and scene ← `ref-c`
- entrance, product action, timing, and ending are newly designed

## Assertions

- No source may dominate four or more similarity dimensions.
- The result must not claim that the still image supplied motion or timing.
- Each of five concepts must alter at least three structural dimensions relative to the others.
- Similarity Report must contain six dimensions and a final decision.
- Both platform packages must be complete and derived from the same accepted director specification.
