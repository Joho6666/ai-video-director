# AI Video Director Real Test

- **测试日期**：2026-09-16（Asia/Shanghai）
- **测试任务**：`73633bcb-16bd-411b-bf82-6c4fb14e283b`
- **测试性质**：第一次真实 DeepSeek Director 调用；仅 Director，不生成视频
- **结论**：`FAIL`（真实调用成功到达校验阶段，但模型输出未通过 Evidence 一致性门禁）

## 1. 测试环境

- **APP_MODE**：`director`
- **DeepSeek Model**：`deepseek-flash`
- **DeepSeek Base URL**：`https://api.deepseek.com`
- **配置**：`.env.local` 中 API Key 存在；Key 未写入本报告
- **Video Provider**：`null`（未调用 Mock Video Provider 或 Seedance）

输入素材来自 Pexels，下载到系统临时目录，仅用于本次测试：

- **Video**：Pexels “Stylish woman in bright green coat walks down city steps”，37.14 秒，1920×1080，29.97 fps；这是公开许可的真实时尚 stock 视频，非品牌发布广告；来源：<https://www.pexels.com/video/slow-motion-16039619/>；SHA-256：`CA4D50FEE9B683E7C7EEC8495E0D6F31A5EBC0DB6BD60879F264A7E2E088F71F`
- **Model image**：Pexels portrait photo 11548432；来源：<https://www.pexels.com/photo/portrait-of-a-woman-wearing-a-black-leather-jacket-and-turtleneck-indoors-looking-thoughtful-11548432/>；SHA-256：`EFC48498196C8B2ACB33863CEA513CF967AF994505A3D448639F186EB68687C2`
- **Product image**：Pexels blue denim jacket photo 16428734；来源：<https://www.pexels.com/photo/minimalist-image-of-a-blue-denim-jacket-suspended-in-midair-against-a-gray-backdrop-16428734/>；SHA-256：`5E404413367C5D3734260EE23545B5F48B028E517E3729262A412A3D0160B9CC`

## 2. Pipeline

| 阶段 | 状态 | 证据 |
|---|---|---|
| 配置读取 | PASS | `APP_MODE=director`，DeepSeek Key/Base URL/Model 均存在 |
| FFprobe metadata | PASS | 37.14 秒，1920×1080，29.97 fps |
| FFmpeg 抽帧 | PASS | `frameCount=32`，时间戳 0.000s–35.979s，按顺序排列 |
| 查看参考帧联系表 | PASS | `reference/contact-sheet.jpg` 已生成 |
| 发送多模态 Director 请求 | PASS | 32 帧 + 1 联系表 + 1 模特图 + 1 商品图；未使用 Mock |
| DeepSeek 返回 JSON | PASS（已收到） | 返回进入本地一致性校验；没有回退 Mock |
| Evidence/analysis 交叉校验 | **FAIL** | `reference_analysis.actions 在 Evidence Unknown 时必须为 Unknown` |
| Shot DNA / 三套方案 / Prompt | NOT TESTED | 前置校验失败，系统未产生有效 plan |
| Seedance | NOT TESTED | 按测试要求禁止调用 |

本次没有生成 MP4；`runtime.json` 记录 `video_provider: null`，任务 `results=[]`，未创建 `results/`。

## 3. Reference Evidence

- **评分**：不评分（输出在 Evidence 门禁前失败）
- **状态**：`FAIL`
- **问题**：模型将 `reference_evidence.actions`（映射到 `action_sequence`）标记为 `Unknown`，但 `treatment.reference_analysis.actions` 仍写入了确定动作描述。现有硬约束正确拒绝了这组互相矛盾的事实。
- **Observed / Inferred / Unknown 检查**：`NOT TESTED`。由于 Envelope 未通过，系统没有写出 `reference-evidence.json`，不能据此宣称帧引用或三状态判断正确。
- **幻觉判断**：本次不能对完整 Evidence 做人工评分；只确认存在一次 Unknown 与分析字段冲突。

## 4. Motion Understanding

- **评分**：不评分（未形成可审查的有效 treatment）
- **状态**：`NOT TESTED`
- **gaze → head → shoulder → torso**：未能从有效输出核对
- **weight shift / support foot**：未能从有效输出核对
- **arm asymmetry / hand contact / settling**：未能从有效输出核对
- **结论**：不能把本次失败解释为动作理解通过或失败；当前已知失败点是 Evidence 一致性。

## 5. Shot DNA

- **评分**：不评分（未形成有效 plan）
- **状态**：`NOT TESTED`
- 未能对 camera 景别、高度、移动方向、跟拍关系，或 subject 路线、节奏、视线进行模型输出级审核。

## 6. V1/V2/V3 Variation

- **状态**：`NOT TESTED`（前置 Evidence 校验失败）
- **原因**：系统未接受 treatment，因此没有可审查的三套方案；不能用缺失结果冒充 Variation PASS 或 FAIL。

## 7. Product Showcase

- **评分**：不评分（未形成有效 supplements）
- **状态**：`NOT TESTED`
- 未能核对每个版本是否回答了产品卖点、人物展示动作和镜头关注位置。

## 8. Seedance Prompt 质量

- **评分**：不评分（未形成有效 generation plan）
- **状态**：`NOT TESTED`
- 本次未调用 Seedance，也没有可安全导出的 V1/V2/V3 Prompt。

## 9. 是否解决客户痛点

**无法确认。** 本次已经证明真实参考视频、连续帧、模特图和商品图进入了 DeepSeek Director，但模型输出没有通过 Evidence 与 analysis 的一致性校验，因此尚不能证明它比普通 AI 视频 Prompt 更接近真人广告导演。

## 10. 下一步建议

仅保留本轮允许的范围：

- **修 Director Prompt**：让模型在映射 Evidence 为 `Unknown` 时同步把对应 `reference_analysis` 字段写为 `Unknown: not visible in sampled frames`，禁止确定性动作描述。
- **修 Evidence**：保留当前硬约束，并在失败时保存脱敏的校验摘要，便于下一次只读复核；不放 API Key、客户素材或原始请求。

本轮没有修改代码、没有修改规则、没有调用 Seedance、没有生成付费视频。
