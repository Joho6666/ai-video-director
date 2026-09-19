# Test Case 01 — High-angle follow walk

## Source and boundary

去身份化案例，依据关联会话中客户第一条约 9 秒竖屏参考视频的既有观察记录。原视频不随 Skill 分发；本机缺少 FFmpeg，本轮未重新抽帧复核。

## Input summary

- Mode: `INSPIRE`
- Product: short light-colored down jacket; show volume, cuff, and side silhouette
- Subject: female model carrying a small handbag
- Goal: 6-second vertical light-luxury social ad
- Reference language: high camera, walking follow, relaxed street-fashion feeling, brief gaze interaction
- Targets: Flow/Veo and Seedance; variations: 5

## Expected director behavior

KEEP：轻奢抓拍感、人物在移动中展示廓形、镜头与人物保持空间联系。MUTATE：直线进场、持续后退跟随、中段回头、居中构图和原结尾。

五个方案至少应分别覆盖：低机位侧跟、固定长焦前景揭示、斜向路线与环境接触、半环绕停步展示、宽景穿越后轻摇。每个方案改变至少三项结构维度。

关键连续动作示例：人物由左脚启动；包所在手臂摆幅小于另一侧；视线先短暂移向镜头，头部稍后跟随，肩部和躯干只产生较小延迟旋转；减速由支撑腿承重完成；包袋继续前摆后回落。

## Assertions

- 不能只写“自然走路、自信微笑”。
- 每条 Timeline 的前后状态可衔接，包袋惯性不能在动作节点瞬间归零。
- INSPIRE 方案不得同时保留高机位、直线前进、摄影机后退、中途回头、居中构图。
- 两个平台均须包含完整、分镜、Motion、Performance、Negative、首尾帧和 Reference 建议。
