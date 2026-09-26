# AI Video Director · DeepSeek Harness Plugin

把 AI Video Director 的核心能力暴露为 DeepSeek Harness 可直接调用的高层 Tool。

## 职责边界

| 层 | 负责 |
| :--- | :--- |
| **DeepSeek Harness** | Agent Loop、Session、Context、Tool Calling、Skill Loading、Planning、Shell / Files |
| **AI Video Director** | Reference Engine、TikHub、FFmpeg、Shot DNA、Motion DNA、Viral Creative DNA、Director、Prompt Compiler、Provider Router、视频生成、质量、重试、付费安全、任务状态 |

核心原则：**LLM 决定做什么（WHAT），确定性代码决定付费与有状态操作怎么做（HOW）。**

Harness 无法通过本插件直接调用 Wan / MiniMax / Seedance：
`video_produce` 只把任务交给现有的 `WorkflowScheduler`，付费提交、去重、重试预算、
QC 证据门禁与恢复逻辑全部留在 `packages/orchestrator` 与 `packages/skills`。

## Tool 列表

| Tool | 作用 | 复用模块 |
| :--- | :--- | :--- |
| `video_reference` | `search` / `resolve` / `import` 抖音·TikTok 参考视频 | `packages/reference-source` |
| `video_analyze` | 导演分析：参考分析、Shot DNA、Motion DNA、V1/V2/V3 方案 | `packages/video-analysis`、`packages/director`、`packages/agent/deepseek`、`DirectorAgent` |
| `video_produce` | 受控生产：生成 + 质检 + 预算内重试 | `WorkflowScheduler`、`ProducerAgent`、`GeneratorAgent`、`QualityAgent`、`RetryAgent` |
| `video_inspect` | 只读审计：状态、Provider、质量报告、重试历史、成片路径 | `WorkflowScheduler` 状态、`agent-run.json` |

## 目录结构

```
dsh-plugin/
├── package.json
├── tsconfig.json
├── cordis.patch.yml        # Harness loader 注册片段
└── src/
    ├── dsh.d.ts            # 从已安装 DSH 运行时抄录的 host 契约
    ├── index.ts            # 唯一接触 DSH 的文件（defineTool + ctx.tools.register）
    ├── tools/
    │   ├── contract.ts     # Tool 描述符契约（不依赖 DSH 运行时）
    │   ├── reference.ts    # video_reference
    │   ├── director.ts     # video_analyze
    │   ├── production.ts   # video_produce
    │   ├── inspect.ts      # video_inspect
    │   └── index.ts
    └── adapters/
        └── task-adapter.ts # Tool ↔ 现有 packages 的唯一桥接层
```

`src/tools/*.ts` 只导出**纯描述符**（name / description / parameters / output / execute），
不 import DSH 运行时，因此可以在本仓库内直接单测。`src/index.ts` 是唯一把描述符交给
`defineTool` 并注册到 `ctx.tools` 的地方，保持插件尽可能薄。

## Skill 接入

`skills/ai-commercial-video-director/` 保持**单一份**，不复制到 `.dsh/skills` 或
`.agents/skills`。原因：`packages/director/skill.ts` 会对该目录下的 SKILL.md 与
prompts / schemas 计算 sha256 并写入 `skill_sha256`，两份副本漂移会静默改变导演方案的指纹。

Harness 通过 **filesystem skill provider 的 `customSkillDirs`** 发现它（见
`cordis.patch.yml` 的 `skill-filesystem` 条目）。SKILL.md 的 frontmatter 已经符合
Harness 要求（`name` 为 kebab-case、`description` 必填），本次只增补了 `whenToUse`
用于按需发现，正文与资源文件未改动。

Skill 采用**按需加载**：frontmatter 只暴露名称与描述，正文与 `prompts/`、`schemas/`
在模型实际调用 `skill` 工具时才读取，不会常驻 system prompt。

`dsh-plugin/src/adapters/skill-adapter.ts#verifyHarnessSkill()` 可以随时校验该目录
当前是否会被 Harness 正常发现（测试中也会断言）。

## 接入 Harness

### ✅ 已实测跑通（2026-09-26）

| 验证项 | 结果 |
| :--- | :--- |
| v1.4 全量 typecheck（含插件） | ✅ 通过 |
| 真实 `defineTool` 加载 + 注册 4 个 tool | ✅ 通过（并因此发现 `additionalProperties` 强制规则） |
| `video_inspect` 读真实任务 | ✅ 29ms |
| `video_reference` 真实调 TikHub | ✅ 返回候选，爆款分与理由正确 |
| `video_analyze` tool 路径 | ✅ `planReady=true` 且幂等（计划未被改写） |
| `video_produce` director 模式 | ✅ 正确拒绝，生成台账 0 条 |
| **DSH headless 端到端** | ✅ 模型自主调用 `video_inspect` 并用中文准确汇报 |

实测用的 profile 在 `~/.dsh/profiles/avd/`（独立于 desktop profile，不影响桌面 App）。

**版本兼容性**：桌面 App 是 `@deepseek-ai/dsh 0.1.7-rc.2`，全局 `dsh` CLI 是
`0.1.0-rc.6`。两者 `defineTool` 契约一致，但 **0.1.0-rc.6 额外强制
`type:'object'` 必须显式声明 `additionalProperties`**，省略会在注册时抛
`JsonSchemaError`。另有一处不兼容：CLI 要求 `.credentials.yaml` 的 `version`
是字符串，而桌面 App 写入的是数字 —— `avd` profile 因此禁用了 credentials 插件，
改由环境变量提供 LLM key，**未改动桌面 App 的凭据文件**。

### 接入步骤

1. 让 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 可从本插件解析
   （它们在 DSH 安装包内，声明为 `peerDependencies`）。实测做法：

   ```powershell
   mklink /J <项目>/node_modules/@deepseek-ai `
             "%USERPROFILE%\.npm-global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
   ```

2. 让 profile 能按名字解析插件：

   ```powershell
   mklink /J "%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-plugin-ai-video-director" `
             <项目>/dsh-plugin
   ```

3. 在 profile 的 `cordis.patch.yml` 中加入本目录 `cordis.patch.yml` 的两段配置。

4. 用 TS-aware 解析器启动（见下），并让工作目录或 `DATA_DIR` 指向项目根目录，
   因为 `packages/shared/storage` 以 `DATA_DIR || data/projects` 作为任务根目录。

### ⚠️ 运行时要求：必须是 TS-aware 的解析器

本插件入口是 **TypeScript 源码**，并且通过无扩展名的相对路径引用 `packages/*`
（与仓库其余部分一致，由 `tsx` 解析）。Node 的原生类型擦除**不会**补全无扩展名
说明符，因此直接 `import()` 会失败。

`cordis-plugin-loader` 使用动态 `import()` 加载插件，所以 Harness profile 必须在能
解析 TypeScript + 无扩展名相对导入的进程中启动，例如：

```sh
node --import tsx <dsh 入口> --profile desktop
```

这与本仓库 `npm test` / `npm run dsh:headless` 的解析方式一致。
若部署环境无法使用 `tsx`，则应先把 `dsh-plugin/` 与其引用的 `packages/*` 一起编译为
带完整扩展名的 ESM 产物，再把 `package.json` 的 `exports` 指向该产物。

## 安全约束（不可绕过）

- `video_produce` 拒绝在存在 `MANUAL_VERIFICATION_REQUIRED` 尝试时执行：提交结果不确定时绝不重复扣费。
- `provider` 只是偏好，必须与确定性 Router 解析结果一致，否则拒绝改道。
- 重试预算由 `packages/skills/retry` 硬性封顶（Wan ≤ 1，其他 ≤ 2），Harness 不能提高。
- `video_inspect` 不取锁、不改状态、不调 Provider，可反复安全调用。
- 默认测试与 Mock 模式不产生任何付费 API 调用。
