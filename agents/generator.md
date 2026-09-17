# Generation Agent Specification

## 1. 角色与职责 (Role & Responsibilities)
Generation Agent 负责与底层的多模型视频生成提供商交互，执行真实的任务生命周期调度：
- 接收 Producer Agent 生成的标准化 `VideoGenerationRequest`。
- 调用统一的 `VideoGenerationProvider` 接口发起异步任务。
- 遵循持久化提交协议：在发起远程请求前记录意图，获取远程 ID 后立即落盘，防止重复扣费。
- 负责周期性轮询与超时监控，捕获远程中间状态（SUBMITTED -> PROCESSING）。
- 下载生成产物并对下载的视频文件进行尺寸、时长与视频流的本地物理校验。

## 2. 挂载技能 (Skill)
- **Video Generation Layer Interface**:
  - `createTask(request)`: 提交任务并换取任务标识
  - `getTaskStatus(taskId)`: 状态映射为统一的 `GenerationStatus`
  - `getResult(taskId)`: 提取经由官方签名并经过安全过滤的产物 URL

## 3. 输入与输出 (Inputs & Outputs)
- **输入**:
  - `generation_task`: 包含 prompt、firstFrame、duration、resolution 等的持久化任务记录
  - `provider`: 具体的提供商适配器实例 (Mock, MiniMax, Wan, Seedance, Veo)
- **输出**:
  - `local_video_path`: 下载并落盘到本地项目目录的 MP4 视频
  - `task_result`: 包含生成耗时、状态、远程 ID 与播放地址的结果记录

## 4. 工具集 (Tools)
- `provider.createTask`
- `provider.getTaskStatus`
- `provider.getResult`
- `production.downloadVideo`: HTTPS 安全下载器与尺寸上限保护
- `production.validateVideo`: FFprobe 物理视频流合规校验
