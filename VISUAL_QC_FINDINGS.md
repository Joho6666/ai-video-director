# Visual QC Findings

- 当前 `packages/skills/quality/index.ts` 不读取视频帧，合法竖屏 MP4 会获得预设分数并被描述为通过，属于假视觉结论。
- Live QC 必须按视频时长抽 16 或 24 帧，发送生成帧、联系表、对应 timeline、模特图与商品图给 DeepSeek，并保存每次 attempt 的 evidence。
- 每条 issue 需要 status、confidence、severity、有效生成帧 ID；商品差异同时引用生成帧和 product ID。不可从采样确认的内容标为 `uncertain`。
- 服务端计算四维分数与通过结果。网络、Schema、证据错误及纯不确定性不能触发付费重试；只允许有证据的可修复缺陷触发一次 live retry。
- Director repair 只能修正 Evidence Unknown 与 analysis 的结构冲突，冻结其它字段并最多执行一次。
