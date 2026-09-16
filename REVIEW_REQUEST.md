# AI Video Director v0.4 Review Request

请审查 `feature/v04-director-first` 当前实现，再决定是否合并到 `main`。本轮目标是让 Director 优先流程可真实验收，同时保持 Mock 演示边界清晰。

审查重点：

- Mock、Director、Full 三种 `APP_MODE` 是否始终映射到正确的 Director、Provider 和任务完成态；Director 是否绝不创建假视频。
- `.env.local`、API Key、DeepSeek 请求体、任务日志、runtime、导出包和 Git 历史是否存在密钥泄漏。
- 任务状态读取是否纯读取；`Idempotency-Key`、持久 `run.lock` 和已有 Seedance `providerTaskId` 是否能阻止重复执行或重复付费提交。
- Evidence 的 Observed／Inferred／Unknown 与 reference analysis、frame ID、商品事实来源是否交叉约束；静态抽帧是否被误当作完整动作路径。
- 三个 Variant 是否以实际 timeline camera state、subject position、performance、entrance、ending 和 product interaction 形成至少三个差异，而不是只改变 structure 标签。
- 每个 Variant 是否保持 2–4 个连续 Beat、2–4 个 product showcase，Seedance Prompt 是否按 P0/P1/P2 压缩并满足长度限制。
- 导出包是否只包含七个白名单文件，拒绝 symlink、路径穿越、绝对路径、原始客户素材、抽样帧、视频、DeepSeek 响应和密钥。
- Seedance 调用是否只存在于 `APP_MODE=full`，并且失败、轮询和已有任务恢复不会偷偷 fallback 到 Mock 或再次提交。
- 测试服务器是否基于 fresh production build；Mock smoke、Director smoke 和 A/B 工具是否没有把缺凭证或缺素材误报为 PASS。

当前验证证据：

- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run smoke` 已通过。
- `npm run director-smoke` 已使用本地 `.env.local` 中的 DeepSeek Key 真实调用 `deepseek-flash`，验证 16 帧、19 张图片、Evidence、plan、runtime、导出 ZIP，且无结果 MP4 和 Seedance 请求。
- 真实 A/B 和 Seedance live 仍需授权客户素材与凭证；没有这些条件时必须保持 `UNAVAILABLE`，不能用字符串差异替代人工视觉复核。

审查通过前不提交、不推送。
