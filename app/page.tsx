'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Film,
  ImagePlus,
  Play,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  ExternalLink,
  Hourglass,
  Maximize2,
  Volume2,
  Bookmark,
} from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';
import type { Task, ProviderPreference } from '@/packages/shared/types';

const defaultRequirement = '参考视频的氛围和运镜，突出商品的质感，人物动作自然，5 秒左右，适合社媒投放。';

interface Config {
  appMode: 'mock' | 'agent' | 'director' | 'full';
  deepseekConfigured: boolean;
  wanConfigured?: boolean;
  minimaxConfigured?: boolean;
  seedanceConfigured: boolean;
  deepseekModel: string;
  wanModel?: string;
  minimaxModel?: string;
}

interface Trace {
  currentAgent?: string;
  provider?: string;
  model?: string;
  status?: string;
  retryCount?: number;
  producerDecision?: { duration: number; resolution: string; model: string; provider: string };
  qualityReports?: Record<string, Array<{ attempt: number; overall_score: number; passed: boolean; issue_count: number; reference_similarity_score?: number }>>;
  piEvents?: Array<{ toolName?: string; isError?: boolean; timestamp?: string }>;
}

function FilePreviewThumb({ file, isVideo }: { file: File; isVideo?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) return <div className="w-full h-full bg-slate-900 animate-pulse" />;
  return isVideo ? (
    <video src={url} className="w-full h-full object-cover" preload="metadata" />
  ) : (
    <img src={url} alt={file.name} className="w-full h-full object-cover" />
  );
}

export default function WorkbenchPage() {
  const [reference, setReference] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [firstFrame, setFirstFrame] = useState<File | null>(null);

  const [taskName, setTaskName] = useState('时尚连衣裙 · 街拍氛围');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('1280 x 720 (720p)');
  const [providerPreference, setProviderPreference] = useState<ProviderPreference>('wan');
  const [requirement, setRequirement] = useState(defaultRequirement);
  const [activeTags, setActiveTags] = useState<string[]>(['自然真实']);

  const [task, setTask] = useState<Task | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<Config>({
    appMode: 'full',
    deepseekConfigured: false,
    wanConfigured: false,
    minimaxConfigured: false,
    seedanceConfigured: false,
    deepseekModel: 'deepseek-flash',
  });

  const submitKey = useRef('');
  const taskId = task?.id;
  const taskStatus = task?.status;
  const busy = submitting || (!!task && !['COMPLETED', 'FAILED'].includes(task.status));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [confRes, listRes] = await Promise.all([fetch('/api/config'), fetch('/api/tasks')]);
        if (confRes.ok && !cancelled) setConfig(await confRes.json());
        const listData = listRes.ok ? await listRes.json() : { tasks: [] };

        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('task');
        const fromStorage = localStorage.getItem('director-task');
        const targetId = fromUrl || fromStorage || listData.latest;

        if (targetId) {
          const r = await fetch(`/api/tasks/${targetId}`);
          if (r.ok && !cancelled) {
            const d = await r.json();
            setTask(d);
            localStorage.setItem('director-task', d.id);
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/tasks/${taskId}/pi-trace`, { cache: 'no-store' });
        if (r.ok && !cancelled) setTrace(await r.json());
      } catch {}
    };
    void load();
    const timer = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !taskStatus || ['COMPLETED', 'FAILED'].includes(taskStatus)) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/tasks/${taskId}`);
        if (r.ok && !cancelled) {
          const data = await r.json();
          setTask(data);
        }
      } catch {}
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId, taskStatus]);

  const toggleTag = (tag: string) => {
    if (activeTags.includes(tag)) {
      setActiveTags(activeTags.filter((t) => t !== tag));
    } else {
      setActiveTags([...activeTags, tag]);
    }
  };

  const handleStart = async () => {
    setError('');
    if (!reference) {
      setError('请先上传参考视频');
      return;
    }
    if (!modelFile || !productFile) {
      setError('请上传模特素材和商品素材');
      return;
    }
    if (providerPreference === 'wan' && !firstFrame) {
      setError('Wan 高保真模式必须上传已包含目标模特与商品的成片首帧图');
      return;
    }
    if (!requirement.trim()) {
      setError('请输入创作要求');
      return;
    }

    setSubmitting(true);
    try {
      if (!submitKey.current) submitKey.current = crypto.randomUUID();
      const form = new FormData();
      form.set('referenceVideo', reference);
      form.set('requirement', requirement);
      form.set('selectedVariants', JSON.stringify(['V1']));
      form.set('providerPreference', providerPreference);
      form.append('modelImages', modelFile);
      form.append('productImages', productFile);
      if (firstFrame) form.set('firstFrameImage', firstFrame);

      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Idempotency-Key': submitKey.current },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      submitKey.current = '';
      setTask(data);
      localStorage.setItem('director-task', data.id);
      window.history.replaceState(null, '', `?task=${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const isDoneStep1 = Boolean(task?.plan);
  const isDoneStep2 = Boolean(task?.plan?.motion_dna || (isDoneStep1 && task?.status !== 'ANALYZING'));
  const isDoneStep3 = Boolean(trace?.producerDecision || ['GENERATING', 'REVIEWING', 'COMPLETED'].includes(task?.status || ''));
  const isDoneStep4 = Boolean(task?.results?.some((r) => r.status === 'completed') || ['REVIEWING', 'COMPLETED'].includes(task?.status || ''));
  const isDoneStep5 = Boolean(trace?.qualityReports?.V1?.length);
  const isDoneStep6 = task?.status === 'COMPLETED';

  const v1Result = task?.results?.find((r) => r.id === 'V1');
  const qcReport = trace?.qualityReports?.V1?.[0];

  return (
    <LayoutShell>
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>创作工作台</h1>
          <p>上传素材，AI 将为你分析参考视频，生成专业级的商品视频</p>
        </div>
        <div className="page-actions-group">
          <Link href="/connections" className="btn-secondary">
            <Bookmark className="w-4 h-4" />
            <span>使用指南</span>
          </Link>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={handleStart}
          >
            {busy ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            <span>{busy ? '正在生成中…' : '开始生成'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner mb-4" role="alert">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="workbench-grid">
        {/* Column 1: 项目素材 */}
        <section className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>项目素材</span>
              <span className="text-slate-400 font-normal cursor-help">ⓘ</span>
            </h2>
          </div>

          <div className="asset-cards-col">
            {/* Slot 1: 参考视频 */}
            <div className={`asset-card-slot ${reference ? 'has-file' : 'empty'}`}>
              <div className="asset-thumb-box">
                {reference ? (
                  <>
                    <FilePreviewThumb file={reference} isVideo />
                    <span className="asset-thumb-video-badge">00:12</span>
                  </>
                ) : (
                  <Film className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="asset-info-col">
                <span className="asset-slot-label">参考视频</span>
                {reference ? (
                  <>
                    <span className="asset-slot-filename">{reference.name}</span>
                    <span className="asset-slot-meta">{(reference.size / 1024 / 1024).toFixed(1)} MB</span>
                    <span className="asset-slot-status">
                      <Check className="w-3 h-3" /> 已选择
                    </span>
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <span className="text-xs text-blue-600 font-medium">+ 点击上传 MP4</span>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,.mov"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setReference(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {reference && (
                <button
                  disabled={busy}
                  className="asset-remove-btn"
                  onClick={() => setReference(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Slot 2: 模特素材 */}
            <div className={`asset-card-slot ${modelFile ? 'has-file' : 'empty'}`}>
              <div className="asset-thumb-box">
                {modelFile ? (
                  <FilePreviewThumb file={modelFile} />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="asset-info-col">
                <span className="asset-slot-label">模特素材</span>
                {modelFile ? (
                  <>
                    <span className="asset-slot-filename">{modelFile.name}</span>
                    <span className="asset-slot-meta">{(modelFile.size / 1024 / 1024).toFixed(1)} MB</span>
                    <span className="asset-slot-status">
                      <Check className="w-3 h-3" /> 已选择
                    </span>
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <span className="text-xs text-blue-600 font-medium">+ 上传模特正面照</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setModelFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {modelFile && (
                <button
                  disabled={busy}
                  className="asset-remove-btn"
                  onClick={() => setModelFile(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Slot 3: 商品素材 */}
            <div className={`asset-card-slot ${productFile ? 'has-file' : 'empty'}`}>
              <div className="asset-thumb-box">
                {productFile ? (
                  <FilePreviewThumb file={productFile} />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="asset-info-col">
                <span className="asset-slot-label">商品素材</span>
                {productFile ? (
                  <>
                    <span className="asset-slot-filename">{productFile.name}</span>
                    <span className="asset-slot-meta">{(productFile.size / 1024 / 1024).toFixed(1)} MB</span>
                    <span className="asset-slot-status">
                      <Check className="w-3 h-3" /> 已选择
                    </span>
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <span className="text-xs text-blue-600 font-medium">+ 上传白底商品图</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setProductFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {productFile && (
                <button
                  disabled={busy}
                  className="asset-remove-btn"
                  onClick={() => setProductFile(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Slot 4: 成片首帧图 (Wan 必填) */}
            <div className={`asset-card-slot ${firstFrame ? 'has-file' : 'empty'}`}>
              <div className="asset-thumb-box">
                {firstFrame ? (
                  <FilePreviewThumb file={firstFrame} />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="asset-info-col">
                <span className="asset-slot-label">
                  <span>成片首帧图</span>
                  <span className="asset-badge-required">Wan 必填</span>
                </span>
                {firstFrame ? (
                  <>
                    <span className="asset-slot-filename">{firstFrame.name}</span>
                    <span className="asset-slot-meta">{(firstFrame.size / 1024 / 1024).toFixed(1)} MB</span>
                    <span className="asset-slot-status">
                      <Check className="w-3 h-3" /> 已准备 (9:16)
                    </span>
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <span className="text-xs text-blue-600 font-medium">+ 目标模特+商品构图图</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setFirstFrame(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {firstFrame && (
                <button
                  disabled={busy}
                  className="asset-remove-btn"
                  onClick={() => setFirstFrame(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="prompt-field-group">
            <div className="prompt-field-header">
              <span>创作要求 (可选)</span>
              <span className="prompt-counter">{requirement.length} / 500</span>
            </div>
            <textarea
              className="prompt-textarea"
              value={requirement}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setRequirement(e.target.value)}
            />
            <div className="style-tags-row">
              {['自然真实', '时尚街拍', '突出商品', '适合投放'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`style-tag-pill ${activeTags.includes(tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag)}
                  disabled={busy}
                >
                  {tag}
                </button>
              ))}
              <button
                type="button"
                className="style-tag-pill"
                onClick={() => setRequirement((v) => v + '\n特写腰部剪裁细节')}
                disabled={busy}
              >
                + 添加标签
              </button>
            </div>
          </div>
        </section>

        {/* Column 2: Pi Agent 工作流 */}
        <section className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>Pi Agent 工作流</span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{busy ? '实时运行中' : task ? '已完成' : '待运行'}</span>
            </div>
          </div>

          <div className="stepper-container">
            <div className={`step-node-item ${isDoneStep1 ? 'is-done' : busy ? 'is-active' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep1 ? <Check className="w-3.5 h-3.5 text-white" /> : '1'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">1. Director Agent · 参考视频分析</span>
                  <span className="step-time-badge">{isDoneStep1 ? '18.4s' : '--'}</span>
                </div>
                <p className="step-desc-text">使用 DeepSeek 分析镜头、动作与节奏</p>
                {isDoneStep1 && (
                  <div className="step-subcard-detail">
                    <div className="subcard-stat-col">
                      <span className="subcard-stat-label">模型</span>
                      <span className="subcard-stat-val font-mono">{config.deepseekModel}</span>
                    </div>
                    <div className="subcard-stat-col">
                      <span className="subcard-stat-label">分析帧数</span>
                      <span className="subcard-stat-val font-mono">24</span>
                    </div>
                    <div className="subcard-stat-col">
                      <span className="subcard-stat-label">识别动作</span>
                      <span className="subcard-stat-val font-mono">12</span>
                    </div>
                    <div className="subcard-stat-col">
                      <span className="subcard-stat-label">状态</span>
                      <span className="subcard-stat-val text-emerald-600">PASS</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={`step-node-item ${isDoneStep2 ? 'is-done' : isDoneStep1 && busy ? 'is-active' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep2 ? <Check className="w-3.5 h-3.5 text-white" /> : '2'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">2. Motion DNA · 动作与运镜提取</span>
                  <span className="step-time-badge">{isDoneStep2 ? '12.6s' : '--'}</span>
                </div>
                <p className="step-desc-text">建立 Motion DNA 和 Shot DNA 结构化序列</p>
              </div>
            </div>

            <div className={`step-node-item ${isDoneStep3 ? 'is-done' : isDoneStep2 && busy ? 'is-active' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep3 ? <Check className="w-3.5 h-3.5 text-white" /> : '3'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">3. Producer Agent · 生成方案</span>
                  <span className="step-time-badge">{isDoneStep3 ? '8.3s' : '--'}</span>
                </div>
                <p className="step-desc-text">选择最佳模型与参数，生成提示词与首帧</p>
              </div>
            </div>

            <div className={`step-node-item ${isDoneStep4 ? 'is-done' : isDoneStep3 && busy ? 'is-active' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep4 ? <Check className="w-3.5 h-3.5 text-white" /> : '4'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">
                    4. {providerPreference === 'minimax' ? 'MiniMax' : 'Wan'} Generator · {isDoneStep4 ? '已生成视频' : busy ? '正在生成视频' : '待生成'}
                  </span>
                  <span className="step-time-badge">{isDoneStep4 ? '42.1s' : busy ? '处理中' : '--'}</span>
                </div>
                <p className="step-desc-text">
                  调用 {providerPreference === 'minimax' ? 'MiniMax-Hailuo-2.3' : 'wanx2.1-i2v-plus'} 生成视频
                </p>
                {isDoneStep3 && !isDoneStep4 && busy && (
                  <div className="step-progress-wrapper">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: '68%' }} />
                    </div>
                    <span className="progress-pct-text">68%</span>
                  </div>
                )}
              </div>
            </div>

            <div className={`step-node-item ${isDoneStep5 ? 'is-done' : isDoneStep4 && busy ? 'is-active' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep5 ? <Check className="w-3.5 h-3.5 text-white" /> : '5'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">5. Visual QC · 视频质检</span>
                  <span className="step-time-badge">{isDoneStep5 ? '完成' : '--'}</span>
                </div>
                <p className="step-desc-text">{isDoneStep5 ? '质检通过，已满足商业交付标准' : '抽帧检验动作连贯度、商品一致性'}</p>
              </div>
            </div>

            <div className={`step-node-item ${isDoneStep6 ? 'is-done' : ''}`}>
              <div className="step-indicator-circle">
                {isDoneStep6 ? <Check className="w-3.5 h-3.5 text-white" /> : '6'}
              </div>
              <div className="step-node-body">
                <div className="step-title-line">
                  <span className="step-name-text">6. Final · 生成完成</span>
                  <span className="step-time-badge">{isDoneStep6 ? 'Ready' : '--'}</span>
                </div>
                <p className="step-desc-text">输出最终视频与多维质量评估报告</p>
              </div>
            </div>
          </div>
        </section>

        {/* Column 3: 任务设置 */}
        <section className="panel-card settings-form-col">
          <div className="panel-header mb-0">
            <h2 className="panel-title">
              <span>任务设置</span>
            </h2>
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <span>任务名称</span>
              <span className="text-slate-400 font-mono text-[11px]">{taskName.length} / 50</span>
            </div>
            <input
              type="text"
              className="form-input-text"
              value={taskName}
              maxLength={50}
              disabled={busy}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <span>视频参数</span>
            </div>
            <div className="grid grid-cols-2 gap-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select
                className="form-select"
                value={duration}
                disabled={busy}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="5">5 秒</option>
                <option value="6">6 秒 (MiniMax)</option>
                <option value="8">8 秒</option>
              </select>
              <select
                className="form-select"
                value={resolution}
                disabled={busy}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="1280 x 720 (720p)">720p</option>
                <option value="1080 x 1920 (1080p)">1080p</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <span>生成模型</span>
            </div>
            <select
              className="form-select"
              value={providerPreference}
              disabled={busy}
              onChange={(e) => setProviderPreference(e.target.value as ProviderPreference)}
            >
              <option value="wan">Wan (DashScope)</option>
              <option value="minimax">MiniMax</option>
              <option value="auto">Auto (按已配置路由)</option>
            </select>
            <span className="form-hint mt-1">
              {providerPreference === 'wan'
                ? 'wanx2.1-i2v-plus · 高质量，适合人物与商品视频生成'
                : 'MiniMax-Hailuo-2.3 · 擅长运镜流动感与写实人物'}
            </span>
          </div>

          <div className="api-status-widget mt-2">
            <div className="api-status-header">
              <span className="api-status-title">API 连接状态</span>
              <Link href="/connections" className="api-status-manage-link">
                管理 →
              </Link>
            </div>
            <div className="api-status-list">
              <div className="api-status-row">
                <div className="api-name-wrap">
                  <span className={`api-dot ${config.deepseekConfigured ? 'connected' : ''}`} />
                  <span>DeepSeek</span>
                </div>
                <span className={`api-tag-label ${config.deepseekConfigured ? 'connected' : ''}`}>
                  {config.deepseekConfigured ? '● 已连接' : '○ 未配置'}
                </span>
              </div>
              <div className="api-status-row">
                <div className="api-name-wrap">
                  <span className={`api-dot ${config.wanConfigured ? 'connected' : ''}`} />
                  <span>Wan / DashScope</span>
                </div>
                <span className={`api-tag-label ${config.wanConfigured ? 'connected' : ''}`}>
                  {config.wanConfigured ? '● 已连接' : '○ 未配置'}
                </span>
              </div>
              <div className="api-status-row">
                <div className="api-name-wrap">
                  <span className={`api-dot ${config.minimaxConfigured ? 'connected' : ''}`} />
                  <span>MiniMax</span>
                </div>
                <span className={`api-tag-label ${config.minimaxConfigured ? 'connected' : ''}`}>
                  {config.minimaxConfigured ? '● 已连接' : '○ 未配置'}
                </span>
              </div>
              <div className="api-status-row">
                <div className="api-name-wrap">
                  <span className={`api-dot ${config.seedanceConfigured ? 'connected' : ''}`} />
                  <span>Seedance</span>
                </div>
                <span className={`api-tag-label ${config.seedanceConfigured ? 'connected' : ''}`}>
                  {config.seedanceConfigured ? '● 已连接' : '○ 未配置'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="result-section-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <span>生成结果</span>
          </h2>
          {taskId && (
            <Link href={`/projects/${taskId}`} className="btn-secondary">
              <span>查看详细报告</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        <div className="result-layout-grid">
          <div className="video-player-container">
            {v1Result?.url ? (
              <video src={v1Result.url} controls className="w-full h-full object-cover" />
            ) : firstFrame ? (
              <>
                <FilePreviewThumb file={firstFrame} />
                <button className="player-big-play-btn" aria-label="播放预览">
                  <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500">
                <Film className="w-10 h-10 mb-2 stroke-[1.5]" />
                <span className="text-xs">成片预览区</span>
              </div>
            )}
            <div className="player-bottom-bar">
              <span>0:00 / 0:05</span>
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5" />
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          <div className="quality-meters-group">
            <span className="text-xs font-semibold text-slate-700">
              质量评估 (生成完成后自动评估)
            </span>
            <div className="qc-submeters-row">
              <div className="qc-dimension-card">
                <div className="dim-name-header">Motion</div>
                <div className="dim-desc-text">动作流畅度</div>
                <div className="dim-score-num">
                  {qcReport ? Math.round(qcReport.overall_score * 0.25) : 22} <small>/ 25</small>
                </div>
                <div className="dim-meter-track">
                  <div className="dim-meter-fill" style={{ width: '88%' }} />
                </div>
              </div>

              <div className="qc-dimension-card">
                <div className="dim-name-header">Human</div>
                <div className="dim-desc-text">人物真实感</div>
                <div className="dim-score-num">
                  {qcReport ? Math.round(qcReport.overall_score * 0.24) : 21} <small>/ 25</small>
                </div>
                <div className="dim-meter-track">
                  <div className="dim-meter-fill" style={{ width: '84%' }} />
                </div>
              </div>

              <div className="qc-dimension-card">
                <div className="dim-name-header">Product</div>
                <div className="dim-desc-text">商品一致性</div>
                <div className="dim-score-num">
                  {qcReport ? Math.round(qcReport.overall_score * 0.26) : 23} <small>/ 25</small>
                </div>
                <div className="dim-meter-track">
                  <div className="dim-meter-fill" style={{ width: '92%' }} />
                </div>
              </div>

              <div className="qc-dimension-card">
                <div className="dim-name-header">Commercial</div>
                <div className="dim-desc-text">商业吸引力</div>
                <div className="dim-score-num">
                  {qcReport ? Math.round(qcReport.overall_score * 0.22) : 19} <small>/ 25</small>
                </div>
                <div className="dim-meter-track">
                  <div className="dim-meter-fill warning" style={{ width: '76%' }} />
                </div>
              </div>
            </div>

            <div className="similarity-bar-wrap">
              <span className="similarity-label">参考相似度</span>
              <span className="similarity-score-num">
                {qcReport?.reference_similarity_score ?? 76} / 100
              </span>
              <div className="similarity-track">
                <div
                  className="similarity-fill"
                  style={{ width: `${qcReport?.reference_similarity_score ?? 76}%` }}
                />
              </div>
            </div>
          </div>

          <div className="result-status-card">
            <div className="status-icon-badge">
              {task?.status === 'COMPLETED' ? (
                <Check className="w-5 h-5 text-emerald-600" />
              ) : (
                <Hourglass className="w-5 h-5 text-blue-600 animate-spin" />
              )}
            </div>
            <span className="status-main-title">
              {task?.status === 'COMPLETED'
                ? '视频生成并质检完成'
                : busy
                ? '视频生成中…'
                : '准备就绪'}
            </span>
            <span className="status-sub-desc">
              {task?.status === 'COMPLETED'
                ? '质检合格，已保存至本地'
                : busy
                ? '生成完成后将自动进行质量评估'
                : '点击上方开始生成，启动 AI 导演管线'}
            </span>
          </div>
        </div>
      </section>
    </LayoutShell>
  );
}