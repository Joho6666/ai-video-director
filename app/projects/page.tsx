'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronRight, Plus, Play, ArrowRight } from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';

interface TaskSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  appMode: string;
  status: string;
}

export default function ProjectsPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tasks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setTasks(d.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <LayoutShell projectCount={tasks.length}>
      <div className="page-header-row mb-6">
        <div className="page-title-group">
          <h1>项目记录</h1>
          <p>管理并回顾所有 AI 导演商业视频创作任务，支持实时查看执行轨迹与导出报告。</p>
        </div>
        <div className="page-actions-group">
          <Link href="/?new=1" className="btn-primary">
            <Plus className="w-4 h-4" />
            <span>新建创作任务</span>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 bg-slate-50">
          <span>任务列表 ({tasks.length})</span>
          <span>按更新时间排序</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">正在读取项目记录…</div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <FileText className="w-10 h-10 text-slate-300 mb-3" />
            <span className="text-sm font-semibold text-slate-700">暂无项目记录</span>
            <p className="text-xs text-slate-400 mt-1 mb-4">从创作工作台上传素材，生成你的第一部产品视频。</p>
            <Link href="/" className="btn-primary">
              <span>前往创作工作台</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={`/projects/${task.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 fill-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-900 block truncate">
                      任务 task_{task.id.slice(0, 8)}…
                    </span>
                    <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                      更新于 {new Date(task.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 font-mono uppercase bg-slate-100 px-2 py-0.5 rounded">
                    {task.appMode}
                  </span>
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                      task.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : task.status === 'FAILED'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {task.status === 'COMPLETED'
                      ? '● 已完成'
                      : task.status === 'FAILED'
                      ? '● 失败'
                      : '● 运行中'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
