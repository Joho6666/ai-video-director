# Test Case 02 — Walk, notice, turn, settle

## Source and boundary

去身份化案例，依据关联会话中客户第二条约 10 秒竖屏参考视频的既有观察记录。原视频不随 Skill 分发；本轮未重新进行像素级分析。

## Input summary

- Mode: `INSPIRE`
- Product: structured long coat; show shoulder line, waist, and back drape
- Goal: 8-second vertical fashion ad with relaxed performance
- Reference action grammar: walk → notice → turn → brief pose → continue
- Risk: rigid block rotation, abrupt smile, reset-to-neutral between beats

## Expected timeline excerpt

`0.0–2.0s`：从稳定步态进入轻微减速，重心逐渐落向右腿，视线仍在环境前方。结束状态为右腿准备承重、左脚即将收步。

`2.0–4.2s`：继承右腿承重；视线先移向侧前方，头部延迟跟随，左肩随后打开，躯干由脚步带动产生有限转向。表情从中性缓慢出现轻微愉悦。

`4.2–5.8s`：继承侧向朝向并完成停步，衣摆与头发晚半拍越过身体后回落，双手保持不对称张力，不重置为标准站姿。

`5.8–8.0s`：先把重心送向前脚再恢复行走；头部比身体稍晚回正，表情逐渐释放，摄影机平顺离开而非突然加速。

## Assertions

- gaze、head、shoulders、torso 不得同时旋转。
- 后段继续行走必须从停步支撑腿状态启动。
- 表情包含 onset、peak、release，不得瞬间切换。
- 动作密度过高时应拆镜，而不是加入更多微动作。
