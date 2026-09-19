# AI Commercial Video Director — MVP

这是一个面向人物型商业信息流视频的“参考视频导演 Skill”。它把参考视频拆成可复用的摄影语言，再重新设计人物路线、动作、运镜和构图，最后输出 Google Flow/Veo 与 Seedance 可用的英文 Prompt。

## 快速使用

至少提供参考视频或文字分析、产品信息、人物/造型、广告目标和目标模型。未指定模式时使用 `INSPIRE`，未指定方案数时输出 5 个。

示例请求：

```text
使用 $ai-commercial-video-director 分析这条参考视频。
模式：INSPIRE
产品：米白色短款羽绒服，重点展示蓬松轮廓、袖口和侧面腰线
人物：年轻女性，手持小号皮包
目标：6 秒竖屏信息流广告，轻奢、松弛、非 T 台
模型：Google Flow/Veo 和 Seedance
输出 5 个结构不同的方案。
```

`RECREATE` 适合接近参考结构但不要求逐帧一致；`FUSION` 需要说明每个参考承担 motion、camera、composition 或 scene 中的哪些角色。要求“第 3 秒完全一样地回头”等精确复刻时，应改用参考视频、Pose/Depth、Motion Control 或 Video-to-Video；本 Skill 只负责导演设计和工作流建议。

## 输出内容

每次输出参考拆解、Shot DNA、方案、连续动作 Timeline、Human Performance Direction、Similarity Report、双平台 Prompt、首尾帧建议、Reference 使用建议、假设和限制。结构化接口见 `schemas/`。

## 设计原则

- 复用视觉目的与拍摄语言，不把换场景当成创新。
- 用状态转换描述动作，不用“自然走路、自信微笑”代替导演指令。
- 人物、服装、头发和道具都遵循重心与惯性。
- 先写模型无关导演规格，再编译平台 Prompt。
- 复杂动作优先拆成短镜，不靠无限堆词解决。

## MVP 自检

已覆盖：三种模式、5 方案默认值、六维相似度检查、连续 Timeline、人物表演层、Flow/Veo 与 Seedance 编译、首尾帧及 Reference 建议。

当前不足：

- 参考分析依赖多模态模型的观察质量；遮挡、剪辑和运动模糊会降低判断可信度。
- Similarity Guard 是语言模型启发式判断，不是视觉 Embedding 或 Optical Flow 测量。
- 视频模型对负面词、细小表情、手部动作和复杂连续动作的遵循度不稳定。
- 本 MVP 没有自动调用视频模型、生成 UI、素材管理或持久化 Shot Library。
- 本轮没有执行真实视频生成，成片效果为 `NOT_TESTED`。

下一阶段应从 5 个方案中选择 2 个，在 Flow/Veo 和 Seedance 分别生成 2–3 轮，按步态、重心、肩臂、眼神时序、表情渐变、次级惯性、产品展示和结构相似度记录失败，再只针对重复失败修改 Prompt 与 preset。
