'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Clapperboard,
  FileText,
  SlidersHorizontal,
  BarChart2,
  Activity,
  Video,
  ChevronRight,
  FolderTree,
  Database,
  Sliders,
} from 'lucide-react';

interface SidebarProps {
  currentProjectCount?: number;
}

export function Sidebar({ currentProjectCount }: SidebarProps) {
  const pathname = usePathname();

  const isBenchmark = pathname.startsWith('/benchmark');

  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-badge">
          <Video className="w-5 h-5 text-white" />
        </div>
        <div className="brand-info">
          <div className="brand-title-row">
            <span className="brand-title">AI Video Director</span>
            <span className="brand-version-badge">v1.3.1</span>
          </div>
          <span className="brand-tagline">用 AI，让好产品被看见</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        <Link
          href="/"
          className={`sidebar-nav-item ${pathname === '/' ? 'active' : ''}`}
        >
          <Clapperboard className="nav-icon" />
          <div className="nav-text-col">
            <span className="nav-label">创作工作台</span>
            <span className="nav-desc">一键生成 AI 商业视频</span>
          </div>
        </Link>

        <Link
          href="/projects"
          className={`sidebar-nav-item ${pathname.startsWith('/projects') ? 'active' : ''}`}
        >
          <FileText className="nav-icon" />
          <div className="nav-text-col">
            <span className="nav-label">项目记录</span>
            <span className="nav-desc">管理你的创作任务</span>
          </div>
          {currentProjectCount !== undefined && currentProjectCount > 0 && (
            <span className="nav-badge-count">{currentProjectCount}</span>
          )}
        </Link>

        <Link
          href="/connections"
          className={`sidebar-nav-item ${pathname === '/connections' ? 'active' : ''}`}
        >
          <SlidersHorizontal className="nav-icon" />
          <div className="nav-text-col">
            <span className="nav-label">API 连接</span>
            <span className="nav-desc">配置你的 AI 模型</span>
          </div>
        </Link>

        <Link
          href="/benchmark"
          className={`sidebar-nav-item ${isBenchmark ? 'active' : ''}`}
        >
          <BarChart2 className="nav-icon" />
          <div className="nav-text-col">
            <span className="nav-label">Real Benchmark</span>
            <span className="nav-desc">真实对比，更可靠的评估</span>
          </div>
          <span className="nav-pill-tag">实验</span>
        </Link>

        {isBenchmark && (
          <div className="sidebar-sub-menu">
            <span className="sub-menu-header">开发者模式</span>
            <a href="#evidence" className="sub-menu-item">
              <FolderTree className="w-3.5 h-3.5" />
              <span>Prompt & Evidence</span>
            </a>
            <a href="#data" className="sub-menu-item">
              <Database className="w-3.5 h-3.5" />
              <span>任务数据</span>
            </a>
            <a href="#export" className="sub-menu-item">
              <Sliders className="w-3.5 h-3.5" />
              <span>导出与调试</span>
            </a>
          </div>
        )}

        <Link
          href="/system"
          className={`sidebar-nav-item ${pathname === '/system' ? 'active' : ''}`}
        >
          <Activity className="nav-icon" />
          <div className="nav-text-col">
            <span className="nav-label">系统状态</span>
            <span className="nav-desc">服务与运行信息</span>
          </div>
        </Link>
      </nav>

      {/* Bottom Status & User Profile */}
      <div className="sidebar-footer">
        <div className="status-box">
          <div className="status-header">
            <span className="status-pulse-dot" />
            <span className="status-title">本地服务正常运行</span>
          </div>
          <div className="status-specs">
            <div className="spec-row">
              <span className="spec-key">版本</span>
              <span className="spec-val">v1.3.1</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">端口</span>
              <span className="spec-val font-mono">127.0.0.1:3080</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">数据目录</span>
              <span className="spec-val font-mono">./data</span>
            </div>
          </div>
        </div>

        <div className="user-profile-bar">
          <div className="user-avatar-circle">J</div>
          <div className="user-info">
            <span className="user-name">Joho</span>
            <span className="user-role">本地模式 · Windows</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
        </div>
      </div>
    </aside>
  );
}
