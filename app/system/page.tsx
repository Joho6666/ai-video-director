'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Cpu, Server, SlidersHorizontal } from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';

interface SystemStatus {
  appVersion: string;
  gitSha: string;
  node: { version: string; ok: boolean };
  ffmpeg: { version: string; ok: boolean; binary: string };
  ffprobe: { version: string; ok: boolean; binary: string };
  storage: { dataRoot: string; dataProjectCount: number; diskFreeGb: number | null; diskTotalGb: number | null };
  server: { host: string; port: number; environment: string };
  connections: Array<{ provider: string; name: string; configured: boolean; model: string }>;
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    fetch('/api/system/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <LayoutShell>
      <div className="page-header-row mb-6">
        <div className="page-title-group">
          <h1>系统状态</h1>
          <p>查看本地运行环境、媒体处理工具、服务监听端口及各 Provider 连通性。</p>
        </div>
        <div className="page-actions-group">
          <Link href="/connections" className="btn-secondary">
            <SlidersHorizontal className="w-4 h-4" />
            <span>配置连接</span>
          </Link>
        </div>
      </div>

      {!status ? (
        <div className="panel-card p-12 text-center text-xs text-slate-400">读取系统健康状态中…</div>
      ) : (
        <div className="space-y-6">
          {/* Health Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Node.js 运行时</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">v{status.node.version}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                PASS
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">FFmpeg 核心</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">已就绪</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                {status.ffmpeg.ok ? 'PASS' : 'FAIL'}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">FFprobe 探测器</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">已就绪</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                {status.ffprobe.ok ? 'PASS' : 'FAIL'}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">本地服务端口</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{status.server.host}:{status.server.port}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                ONLINE
              </span>
            </div>
          </div>

          {/* Provider Status Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Provider 接入状态</h3>
              <Link href="/connections" className="text-xs text-blue-600 hover:underline">
                管理连接 →
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {status.connections.map((c) => (
                <div key={c.provider} className="flex items-center justify-between p-4 text-xs">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${c.configured ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block text-sm">{c.name || c.provider}</span>
                      <span className="text-slate-400 font-mono">{c.model}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full font-medium border ${
                      c.configured
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {c.configured ? '● 已配置' : '○ 未配置'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Storage Information */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">本地存储与数据目录</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-3">
              <div>
                <span className="text-slate-400 block mb-0.5">本地项目数</span>
                <span className="text-sm font-bold text-slate-800 font-mono">{status.storage.dataProjectCount} 个</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">磁盘可用容量</span>
                <span className="text-sm font-bold text-slate-800 font-mono">{status.storage.diskFreeGb ?? '--'} GB</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Git 版本哈希</span>
                <span className="text-sm font-bold text-slate-800 font-mono">{status.gitSha}</span>
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600 truncate">
              {status.storage.dataRoot}
            </div>
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
