'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Copy, Download, RotateCcw, Video, ShieldCheck, Film, Image as ImageIcon, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';
import type { Task } from '@/packages/shared/types';

interface PiTrace {
  taskId: string;
  status: string;
  currentAgent?: string;
  provider?: string;
  model?: string;
  retryCount: number;
  transitions: Array<{ agent: string; to: string; timestamp: string; message: string }>;
  piEvents: Array<{ toolName?: string; isError?: boolean; timestamp?: string; args?: unknown; result?: unknown }>;
  producerDecision?: { provider: string; model: string; duration: number; resolution: string };
  qualityReports: Record<string, Array<{ attempt: number; overall_score: number; passed: boolean; issue_count: number; reference_similarity_score?: number }>>;
}

const STEP_DEFINITIONS = [
  { key: 'analyze_reference', name: '1. analyze_reference', desc: '分析参考视频，提取镜头语言与动作特征', defaultDuration: '18.4 s' },
  { key: 'build_director_plan', name: '2. build_director_plan', desc: '生成导演方案 (Motion DNA / Shot DNA)', defaultDuration: '12.7 s' },
  { key: 'select_video_provider', name: '3. select_video_provider', desc: '选择最合适视频生成模型', defaultDuration: '3.1 s' },
  { key: 'generate_video', name: '4. generate_video', desc: '使用 Wan 生成视频 (首次尝试)', defaultDuration: '42.1 s' },
  { key: 'review_video', name: '5. review_video', desc: 'AI 质检与评分', defaultDuration: '--' },
  { key: 'refine_generation', name: '6. refine_generation', desc: '如需要，进行靶向重试 (最多 1 次)', defaultDuration: '--' },
  { key: 'finalize_delivery', name: '7. finalize_delivery', desc: '完成并生成最终视频', defaultDuration: '--' },
];

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const [trace, setTrace] = useState<PiTrace | null>(null);
  const [selectedStep, setSelectedStep] = useState('generate_video');
  const [activeTab, setActiveTab] = useState<'trace' | 'result' | 'qc' | 'files'>('trace');
  const [copied, setCopied] = useState(false);

  // Accordion drawer states
  const [openDrawer, setOpenDrawer] = useState<'inputs' | 'params' | 'response' | null>(null);

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [taskRes, traceRes] = await Promise.all([
          fetch(`/api/tasks/${id}`),
          fetch(`/api/tasks/${id}/pi-trace`, { cache: 'no-store' }),
        ]);
        if (taskRes.ok && !cancelled) setTask(await taskRes.json());
        if (traceRes.ok && !cancelled) setTrace(await traceRes.json());
      } catch {}
    };
    void load();
    const timer = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  const copyTaskId = () => {
    if (!id) return;
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCompleted = task?.status === 'COMPLETED';
  const isFailed = task?.status === 'FAILED';
  

  return (
    <LayoutShell>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <Link href="/" className="hover:text-blue-600">
          创作工作台
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-800 font-medium">任务详情</span>
      </div>

      {/* Page Heading */}
      <div className="page-header-row mb-6">
        <div className="page-title-group">
          <div className="flex items-center gap-2">
            <h1>Pi Agent 运行轨迹</h1>
            <span className="brand-version-badge">v1.3.1</span>
          </div>
          <p>从参考视频到成片，AI 导演团队正在为你创作高质量的商品视频。</p>
        </div>
        <div className="page-actions-group">
          <button className="btn-secondary" onClick={copyTaskId}>
            <Copy className="w-4 h-4" />
            <span>{copied ? '已复制' : '复制链接'}</span>
          </button>
          {task?.plan && (
            <a
              href={`/api/media/${id}/exports/creative-package.zip?download=1`}
              className="btn-secondary"
            >
              <Download className="w-4 h-4" />
              <span>下载报告</span>
            </a>
          )}
          <Link href="/?new=1" className="btn-primary">
            <RotateCcw className="w-4 h-4" />
            <span>重新创作</span>
          </Link>
        </div>
      </div>

      {/* Task Summary Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              {task?.requirement ? task.requirement.slice(0, 18) + '…' : '秋季女装展示_001'}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isFailed
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`}
              />
              <span>{isCompleted ? '已完成' : isFailed ? '失败' : '运行中'}</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
            <span>创建时间 {task?.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '2024-12-19 10:12:20'}</span>
            <span>|</span>
            <span className="flex items-center gap-1">
              任务 ID task_{id ? id.slice(0, 6) : '8f3a2e'}…
              <Copy className="w-3.5 h-3.5 cursor-pointer hover:text-slate-800" onClick={copyTaskId} />
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-6 pt-3 text-sm font-medium">
          <button
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'trace'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('trace')}
          >
            运行轨迹
          </button>
          <button
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'result'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('result')}
          >
            生成结果
          </button>
          <button
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'qc'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('qc')}
          >
            质量评估
          </button>
          <button
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'files'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab('files')}
          >
            任务文件
          </button>
        </div>
      </div>

      {/* Main Grid: 7-Step Timeline (Left) + Current Step Details (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Column: 7-Step Timeline (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col gap-5">
            {STEP_DEFINITIONS.map((s, index) => {
              const event = trace?.piEvents?.find((e) => e.toolName === s.key);
              const isDone = Boolean(event && !event.isError) || (isCompleted && index <= 3);
              const isActive = (trace?.currentAgent === s.key) || (!isCompleted && !isDone && index === 3);
              const isSelected = selectedStep === s.key;

              return (
                <div
                  key={s.key}
                  className={`flex gap-4 p-3 rounded-lg cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-50/50 border-blue-200 shadow-sm'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedStep(s.key)}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isActive
                        ? 'border-2 border-blue-600 text-blue-600 bg-white ring-4 ring-blue-100'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4 text-white" /> : index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                      <span className="text-xs font-mono text-slate-500">{s.defaultDuration}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
                    {isActive && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: '68%' }} />
                        </div>
                        <span className="text-xs font-mono font-semibold text-blue-600">68%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    <span
                      className={`px-2 py-0.5 text-[11px] rounded-full font-medium ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-700'
                          : isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isDone ? '● 已完成' : isActive ? '● 运行中' : '等待中'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Step Detail Card (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">{selectedStep}</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">使用 Wan 生成视频 (首次尝试)</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              ● 运行中
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">视频模型</span>
              <span className="font-semibold text-slate-800">
                {trace?.producerDecision?.provider === 'minimax' ? 'MiniMax' : 'Wan / DashScope'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">模型版本</span>
              <span className="font-semibold text-slate-800 font-mono">
                {trace?.producerDecision?.model || 'wanx2.1-i2v-plus'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">视频时长</span>
              <span className="font-semibold text-slate-800">
                {trace?.producerDecision?.duration ?? 5} 秒
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">分辨率</span>
              <span className="font-semibold text-slate-800 font-mono">
                {trace?.producerDecision?.resolution || '720p (1280 × 720)'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">付费提交</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 安全模式 (已启用)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">任务 ID</span>
              <span className="font-mono text-slate-700 flex items-center gap-1">
                task_****7f3a
                <Copy className="w-3 h-3 cursor-pointer text-slate-400 hover:text-slate-600" />
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">重试次数</span>
              <span className="font-semibold text-slate-800 font-mono">
                {trace?.retryCount ?? 0} / 1
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">远端任务状态</span>
              <span className="font-semibold text-blue-600">处理中</span>
            </div>
          </div>

          {/* Expandable Accordion Drawers */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            {/* Drawer 1: 输入素材 */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100"
                onClick={() => setOpenDrawer(openDrawer === 'inputs' ? null : 'inputs')}
              >
                <span>输入素材 (4 项)</span>
                {openDrawer === 'inputs' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openDrawer === 'inputs' && (
                <div className="p-3 text-xs text-slate-600 bg-white border-t border-slate-200 flex flex-col gap-1.5">
                  <div>• 参考视频：fashion_ref.mp4 (00:12)</div>
                  <div>• 模特图：model.jpg (1024 × 1365)</div>
                  <div>• 商品图：product.jpg (1024 × 1365)</div>
                  <div>• 成片首帧：first_frame.jpg (1280 × 720)</div>
                </div>
              )}
            </div>

            {/* Drawer 2: 生成参数 */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100"
                onClick={() => setOpenDrawer(openDrawer === 'params' ? null : 'params')}
              >
                <span>生成参数</span>
                {openDrawer === 'params' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openDrawer === 'params' && (
                <div className="p-3 text-xs text-slate-600 bg-white border-t border-slate-200 font-mono space-y-1">
                  <div>{'mode: "image-to-video"'}</div>
                  <div>duration: 5</div>
                  <div>{'aspect_ratio: "9:16"'}</div>
                  <div>{'prompt_version: "v1.3_visual_lock_focused"'}</div>
                </div>
              )}
            </div>

            {/* Drawer 3: API 响应 */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100"
                onClick={() => setOpenDrawer(openDrawer === 'response' ? null : 'response')}
              >
                <span>API 响应</span>
                {openDrawer === 'response' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {openDrawer === 'response' && (
                <div className="p-3 text-xs text-slate-600 bg-white border-t border-slate-200 font-mono">
                  <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify({ task_status: 'PROCESSING', progress: 68, http: 200 }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Protection Notice Box */}
          <div className="mt-auto bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>已启用付费损失保护：仅在明确的高质量缺陷下触发重试。</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: 3 Cards (输入素材, Visual QC 结果, 事件日志) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: 输入素材 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-900">输入素材</h4>
            <span className="text-xs text-blue-600 hover:underline cursor-pointer">查看全部 →</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[3/4] bg-slate-900 rounded-md overflow-hidden relative">
                <Film className="w-5 h-5 text-white/70 absolute inset-0 m-auto" />
                <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 text-white px-1 rounded font-mono">00:15</span>
              </div>
              <span className="text-[10px] text-slate-600 mt-1 truncate max-w-full">参考视频</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[3/4] bg-slate-100 rounded-md overflow-hidden border border-slate-200 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-slate-400" />
              </div>
              <span className="text-[10px] text-slate-600 mt-1 truncate max-w-full">模特素材</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[3/4] bg-slate-100 rounded-md overflow-hidden border border-slate-200 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-slate-400" />
              </div>
              <span className="text-[10px] text-slate-600 mt-1 truncate max-w-full">商品素材</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[3/4] bg-slate-100 rounded-md overflow-hidden border border-slate-200 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-slate-400" />
              </div>
              <span className="text-[10px] text-slate-600 mt-1 truncate max-w-full">成片首帧</span>
            </div>
          </div>
        </div>

        {/* Card 2: Visual QC 结果 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-900">Visual QC 结果</h4>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ● 正在生成中
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 block">Motion 动作自然度</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">-- / 25</span>
              <span className="text-[10px] text-slate-400 mt-1 block">分析中…</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 block">Human 人物一致性</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">-- / 25</span>
              <span className="text-[10px] text-slate-400 mt-1 block">分析中…</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 block">Product 商品一致性</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">-- / 25</span>
              <span className="text-[10px] text-slate-400 mt-1 block">分析中…</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 block">Commercial 商业表现力</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">-- / 25</span>
              <span className="text-[10px] text-slate-400 mt-1 block">分析中…</span>
            </div>
          </div>
        </div>

        {/* Card 3: 事件日志 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-900">事件日志</h4>
            <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              ● 实时
            </span>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[160px] pr-1">
            {task?.logs?.length ? (
              task.logs.slice(-5).map((log, index) => (
                <div key={index} className="flex items-start gap-2.5 text-xs">
                  <span className="text-slate-400 font-mono text-[11px] flex-shrink-0 mt-0.5">
                    {new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">暂无事件日志</div>
            )}
          </div>
        </div>
      </div>
    </LayoutShell>
  );
}
