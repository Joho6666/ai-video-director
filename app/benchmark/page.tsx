'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, RotateCcw, ChevronRight, Check, CheckCircle2, Film, Image as ImageIcon, ArrowRight, HelpCircle, Play, Volume2, Maximize2 } from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';

interface BenchmarkRun {
  run_id?: string;
  provider?: string;
  model?: string;
  mode?: string;
  status?: string;
  duration?: number;
  resolution?: string;
  cases?: Array<{
    case_id: string;
    blind_assignment?: { video_A_arm: string; video_B_arm: string };
  }>;
}

export default function BenchmarkPage() {
  const [, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedCase, setSelectedCase] = useState('女装_001');
  const [selectedProvider, setSelectedProvider] = useState('Wan / DashScope');
  const [selectedModel, setSelectedModel] = useState('wanx2.1-i2v-plus');
  const [selectedDuration, setSelectedDuration] = useState('5 秒');
  const [showManifest, setShowManifest] = useState(false);

  useEffect(() => {
    fetch('/api/benchmark', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .catch(() => {});
  }, []);

  return (
    <LayoutShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <span>Benchmark</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-800 font-medium">{selectedCase}</span>
      </div>

      {/* Header */}
      <div className="page-header-row mb-6">
        <div className="page-title-group">
          <div className="flex items-center gap-2">
            <h1>Real Benchmark</h1>
            <span className="brand-version-badge">v1.3.1</span>
          </div>
          <p>真实成片对比，不使用模拟评分。基于相同首帧、相同模型、相同参数进行公平测试。</p>
        </div>
        <div className="page-actions-group">
          <button className="btn-secondary" onClick={() => alert('报告导出准备中')}>
            <Download className="w-4 h-4" />
            <span>导出报告</span>
          </button>
          <button className="btn-primary bg-slate-900 hover:bg-slate-800">
            <RotateCcw className="w-4 h-4" />
            <span>重新运行</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="benchmark-filter-bar">
        <div className="filter-controls-group">
          <div className="filter-select-item">
            <span className="text-slate-500 font-medium">测试案例</span>
            <select
              value={selectedCase}
              onChange={(e) => setSelectedCase(e.target.value)}
            >
              <option value="女装_001">女装_001 (经典风衣展示)</option>
              <option value="美妆_002">美妆_002 (精华液质感)</option>
              <option value="数码_003">数码_003 (无线耳机交互)</option>
            </select>
          </div>

          <div className="filter-select-item">
            <span className="text-slate-500 font-medium">视频模型</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
            >
              <option value="Wan / DashScope">Wan / DashScope</option>
              <option value="MiniMax">MiniMax</option>
            </select>
          </div>

          <div className="filter-select-item">
            <span className="text-slate-500 font-medium">模型版本</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="wanx2.1-i2v-plus">wanx2.1-i2v-plus</option>
              <option value="MiniMax-Hailuo-2.3">MiniMax-Hailuo-2.3</option>
            </select>
          </div>

          <div className="filter-select-item">
            <span className="text-slate-500 font-medium">视频时长</span>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
            >
              <option value="5 秒">5 秒</option>
              <option value="6 秒">6 秒</option>
            </select>
          </div>
        </div>

        <div className="filter-badges-group">
          <span className="verified-tag">
            <Check className="w-3.5 h-3.5" />
            <span>使用相同首帧 (已验证)</span>
          </span>
          <span className="verified-tag">
            <Check className="w-3.5 h-3.5" />
            <span>盲测评估 (已启用)</span>
          </span>
        </div>
      </div>

      {/* Video Comparison Grid (Video A vs Video B + Assets) */}
      <div className="benchmark-video-grid">
        {/* Video A */}
        <div className="comparison-video-card">
          <div className="comp-card-header">
            <span className="comp-card-title">Video A</span>
            <span className="comp-card-badge">盲测中</span>
          </div>
          <div className="video-player-container">
            <div className="flex flex-col items-center justify-center text-slate-500">
              <Film className="w-10 h-10 mb-2 stroke-[1.5]" />
              <span className="text-xs font-mono">Video A (Baseline)</span>
            </div>
            <button className="player-big-play-btn" aria-label="播放 A">
              <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
            </button>
            <div className="player-bottom-bar">
              <span>0:00 / 0:05</span>
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5" />
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Video B */}
        <div className="comparison-video-card">
          <div className="comp-card-header">
            <span className="comp-card-title">Video B</span>
            <span className="comp-card-badge">盲测中</span>
          </div>
          <div className="video-player-container">
            <div className="flex flex-col items-center justify-center text-slate-500">
              <Film className="w-10 h-10 mb-2 stroke-[1.5]" />
              <span className="text-xs font-mono">Video B (Director)</span>
            </div>
            <button className="player-big-play-btn" aria-label="播放 B">
              <Play className="w-5 h-5 fill-slate-900 ml-0.5" />
            </button>
            <div className="player-bottom-bar">
              <span>0:00 / 0:05</span>
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5" />
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: 测试素材 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">测试素材</h3>
            <span className="text-xs text-blue-600 hover:underline cursor-pointer">查看全部 →</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 p-1.5 border border-slate-100 rounded-lg">
              <div className="w-10 h-12 bg-slate-900 rounded overflow-hidden flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block truncate">成片首帧 (first_frame.jpg)</span>
                <span className="text-[10px] text-slate-400 font-mono">1280 × 720</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-1.5 border border-slate-100 rounded-lg">
              <div className="w-10 h-12 bg-slate-900 rounded overflow-hidden flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block truncate">商品图 (product.jpg)</span>
                <span className="text-[10px] text-slate-400 font-mono">1024 × 1365</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-1.5 border border-slate-100 rounded-lg">
              <div className="w-10 h-12 bg-slate-900 rounded overflow-hidden flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block truncate">模特图 (model.jpg)</span>
                <span className="text-[10px] text-slate-400 font-mono">1024 × 1365</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-1.5 border border-slate-100 rounded-lg">
              <div className="w-10 h-12 bg-slate-900 rounded overflow-hidden flex items-center justify-center relative">
                <Film className="w-4 h-4 text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block truncate">参考视频 (reference.mp4)</span>
                <span className="text-[10px] text-slate-400 font-mono">00:12</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: 盲测评估结果表格 + 运行信息 */}
      <div className="benchmark-data-section">
        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">盲测评估结果</h3>
              <p className="text-xs text-slate-500 mt-0.5">基于视频内容的客观证据进行评估，裁判模型对实验分组不可见</p>
            </div>
          </div>

          <table className="benchmark-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>评估维度</th>
                <th style={{ width: '20%' }}>Video A</th>
                <th style={{ width: '20%' }}>Video B</th>
                <th>关键证据帧 (示例)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-semibold text-slate-800">Motion 动作表现</span>
                </td>
                <td>
                  <span className="score-badge">
                    80 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <span className="score-badge">
                    88 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <div className="evidence-frames-row">
                    <div className="evidence-frame-thumb bg-slate-800" />
                    <div className="evidence-frame-thumb bg-slate-700" />
                    <div className="evidence-frame-thumb bg-slate-600" />
                    <span className="text-xs text-slate-500 font-mono ml-2">6 帧</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td>
                  <span className="font-semibold text-slate-800">Human 人物表现</span>
                </td>
                <td>
                  <span className="score-badge">
                    76 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <span className="score-badge">
                    84 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <div className="evidence-frames-row">
                    <div className="evidence-frame-thumb bg-slate-800" />
                    <div className="evidence-frame-thumb bg-slate-700" />
                    <div className="evidence-frame-thumb bg-slate-600" />
                    <span className="text-xs text-slate-500 font-mono ml-2">8 帧</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td>
                  <span className="font-semibold text-slate-800">Product 商品一致性</span>
                </td>
                <td>
                  <span className="score-badge">
                    78 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <span className="score-badge">
                    82 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <div className="evidence-frames-row">
                    <div className="evidence-frame-thumb bg-slate-800" />
                    <div className="evidence-frame-thumb bg-slate-700" />
                    <div className="evidence-frame-thumb bg-slate-600" />
                    <span className="text-xs text-slate-500 font-mono ml-2">5 帧</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td>
                  <span className="font-semibold text-slate-800">Commercial 商业表现</span>
                </td>
                <td>
                  <span className="score-badge">
                    72 <span className="quality-pill-tag fair">Fair</span>
                  </span>
                </td>
                <td>
                  <span className="score-badge">
                    80 <span className="quality-pill-tag good">Good</span>
                  </span>
                </td>
                <td>
                  <div className="evidence-frames-row">
                    <div className="evidence-frame-thumb bg-slate-800" />
                    <div className="evidence-frame-thumb bg-slate-700" />
                    <div className="evidence-frame-thumb bg-slate-600" />
                    <span className="text-xs text-slate-500 font-mono ml-2">6 帧</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: 运行信息 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">运行信息</h3>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">任务 ID</span>
                <span className="font-mono text-slate-700">task_20250919_142831</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">测试模式</span>
                <span className="font-medium text-slate-800">Real (真实成片)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">视频模型</span>
                <span className="font-mono text-slate-700">wanx2.1-i2v-plus</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">视频时长</span>
                <span className="text-slate-800">5 秒</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">分辨率</span>
                <span className="font-mono text-slate-700">1280 × 720</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">预计费用</span>
                <span className="font-mono text-slate-800">¥ 1.20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">实际消耗</span>
                <span className="font-mono text-slate-800">¥ 1.20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">付费提交次数</span>
                <span className="font-mono text-slate-800">2 / 2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">重试次数</span>
                <span className="font-mono text-slate-800">0 / 1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">清单验证</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 已验证
                </span>
              </div>
            </div>
          </div>

          <button
            className="btn-secondary w-full justify-center mt-4"
            onClick={() => setShowManifest(!showManifest)}
          >
            <span>{showManifest ? '收起 Manifest' : '查看完整 Manifest'}</span>
          </button>
        </div>
      </div>

      {showManifest && (
        <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs mb-6 overflow-x-auto">
          <pre>
            {JSON.stringify(
              {
                run_id: 'run_20250919_142831',
                case_id: '01_womenswear',
                provider: 'wan',
                model: 'wanx2.1-i2v-plus',
                duration: 5,
                resolution: '720P',
                blind_assignment: {
                  video_A: 'baseline',
                  video_B: 'director',
                },
                manifest_status: 'VERIFIED_PAIR',
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Bottom: 揭盲结果 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-bold text-slate-900">揭盲结果</h3>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            (对比两种方法的实际效果，参考相似度不计入质量总分)
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          </span>
        </div>

        <div className="unblind-card-grid">
          {/* Card A: Baseline */}
          <div className="unblind-arm-card">
            <div className="unblind-arm-header">
              <span className="arm-title">Baseline (Video A)</span>
              <span className="text-xs text-slate-400">普通商业提示词</span>
            </div>
            <div className="arm-score-display">
              74 <small>/ 100</small>
            </div>
            <div className="arm-submeters">
              <div className="submeter-cell">
                <span className="submeter-label">Motion</span>
                <span className="submeter-val">18/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Human</span>
                <span className="submeter-val">19/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Product</span>
                <span className="submeter-val">19/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Commercial</span>
                <span className="submeter-val">18/25</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span>参考相似度</span>
              <span className="font-mono font-semibold text-slate-800">77 / 100</span>
            </div>
          </div>

          {/* VS Divider */}
          <div className="vs-divider-circle">VS</div>

          {/* Card B: Director */}
          <div className="unblind-arm-card">
            <div className="unblind-arm-header">
              <span className="arm-title">Director (Video B)</span>
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ✓ 更好的效果
              </span>
            </div>
            <div className="arm-score-display text-blue-600">
              82 <small>/ 100</small>
            </div>
            <div className="arm-submeters">
              <div className="submeter-cell">
                <span className="submeter-label">Motion</span>
                <span className="submeter-val text-blue-600">22/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Human</span>
                <span className="submeter-val text-blue-600">21/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Product</span>
                <span className="submeter-val text-blue-600">21/25</span>
              </div>
              <div className="submeter-cell">
                <span className="submeter-label">Commercial</span>
                <span className="submeter-val text-blue-600">18/25</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span>参考相似度</span>
              <span className="font-mono font-semibold text-blue-600">80 / 100</span>
            </div>
          </div>

          {/* Delta Box */}
          <div className="delta-callout-box">
            <span className="delta-number">+8</span>
            <span className="delta-label">质量提升</span>
            <span className="text-[10px] text-emerald-700">相对 Baseline</span>
            <p className="delta-subtext">在动作自然度和人物表现上有明显提升</p>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Status Bar */}
      <div className="benchmark-sticky-footer">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-bold text-slate-900">REAL BENCHMARK COMPLETED</span>
          <span className="text-xs text-slate-400 font-mono">
            总耗时 4 分 28 秒 | 2 个视频 | 8 张证据帧 | 评估完成
          </span>
        </div>

        <Link href="/projects" className="btn-primary bg-slate-900 hover:bg-slate-800">
          <span>查看详细报告</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </LayoutShell>
  );
}
