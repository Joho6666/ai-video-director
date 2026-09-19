# Prompt Compiler

Compile only after the model-independent directing specification and all quality gates pass. Keep Chinese analysis outside the English generation prompt.

## Common package per concept

Return:

- complete prompt
- shot-by-shot prompt
- motion prompt
- performance prompt
- negative prompt
- first-frame recommendation
- last-frame recommendation
- reference usage recommendation

Do not add unsupported camera measurements. Do not stack contradictory terms such as static and tracking, wide-angle distortion and telephoto compression, or locked-off and handheld.

## Google Flow / Veo

Write an English prompt in this order: commercial objective and subject, scene, camera-subject relationship, chronological action, performance timing, product visibility, lighting/look, physical continuity, exclusions. Make reference and frame roles explicit outside the prompt. Recommend shorter shots or first/last frames when a single generation contains too many state changes. Treat references as identity/style/composition guidance, not proof of exact motion control.

## Seedance

Write a compact English prompt organized by time beats. State subject path and camera path together, then performance and secondary inertia. Favor one coherent camera behavior and a small number of high-value actions. Keep negative motion constraints concise and directly tied to failure risks.

## Reference routing

- Text-only: simple action and loose composition.
- Character/product images: identity, clothing, or product fidelity.
- First frame: entrance, composition, silhouette, and initial contact state.
- Last frame: exact landing composition or CTA-ready product pose.
- Reference video/motion control: timing or trajectory fidelity beyond reliable text prompting.

Always distinguish a recommendation from a guaranteed platform capability, and disclose when actual model support must be checked in the user's current interface.
