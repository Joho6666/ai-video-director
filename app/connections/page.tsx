'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ExternalLink,
  SlidersHorizontal,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { LayoutShell } from '@/components/app-shell/layout-shell';

interface ConnectionItem {
  provider: string;
  name: string;
  role: string;
  configured: boolean;
  maskedKey: string | null;
  baseUrl: string;
  model: string;
  models: string[];
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  

  const load = async () => {
    try {
      const res = await fetch('/api/settings/connections', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch {}
  };

  useEffect(() => {
    void load();
  }, []);

  const handleTest = async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch('/api/settings/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          key: editKeys[provider] || undefined,
        }),
      });
      const data = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: data.ok, message: data.message },
      }));
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [provider]: { ok: false, message: '测试异常' },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async (item: ConnectionItem) => {
    setSaving(item.provider);
    try {
      const res = await fetch('/api/settings/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: item.provider,
          key: editKeys[item.provider] || undefined,
          model: item.model,
          baseUrl: item.baseUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
        
        setEditKeys((prev) => ({ ...prev, [item.provider]: '' }));
      }
    } catch {}
    finally {
      setSaving(null);
    }
  };

  const deepseek = connections.find((c) => c.provider === 'deepseek');
  const wan = connections.find((c) => c.provider === 'wan');
  const minimax = connections.find((c) => c.provider === 'minimax');
  const seedance = connections.find((c) => c.provider === 'seedance');

  return (
    <LayoutShell>
      {/* Top Search & Navigation Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索项目、任务或功能...  Ctrl K"
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>本地服务运行中 127.0.0.1:3080</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-md font-medium cursor-pointer">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] grid place-items-center">J</span>
            <span>Joho</span>
          </div>
        </div>
      </div>

      {/* Page Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>连接与本地运行</h1>
          <p>配置你自己的 API Key，在本地运行 AI Video Director。所有密钥仅保存在本机，不会上传到任何第三方。</p>
        </div>
        <div className="page-actions-group">
          <a
            href="https://github.com/Joho6666/ai-video-director"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <ExternalLink className="w-4 h-4" />
            <span>查看配置文档</span>
          </a>
        </div>
      </div>

      {/* 4-Step Wizard Indicator */}
      <div className="wizard-steps-bar">
        <div className="wizard-step-card done">
          <div className="wizard-step-num">
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="wizard-step-text">
            <span className="wizard-step-name">1. 系统检查</span>
            <span className="wizard-step-desc">检查本地环境</span>
          </div>
        </div>

        <div className="wizard-step-card done">
          <div className="wizard-step-num">
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="wizard-step-text">
            <span className="wizard-step-name">2. 配置 AI Director</span>
            <span className="wizard-step-desc">设置 DeepSeek</span>
          </div>
        </div>

        <div className="wizard-step-card active">
          <div className="wizard-step-num">3</div>
          <div className="wizard-step-text">
            <span className="wizard-step-name">3. 配置视频 Provider</span>
            <span className="wizard-step-desc">选择视频生成模型</span>
          </div>
        </div>

        <div className="wizard-step-card">
          <div className="wizard-step-num">4</div>
          <div className="wizard-step-text">
            <span className="wizard-step-name">4. 验证连接</span>
            <span className="wizard-step-desc">测试所有服务</span>
          </div>
        </div>
      </div>

      {/* 2x2 Provider Cards Grid */}
      <div className="provider-cards-grid">
        {/* Card 1: DeepSeek */}
        {deepseek && (
          <div className="provider-card-box">
            <div className="provider-card-top">
              <div className="provider-title-row">
                <div className="provider-icon-badge text-blue-600 bg-blue-50">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="provider-name-title">{deepseek.name}</h3>
                  <p className="provider-role-desc">{deepseek.role}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 text-xs rounded-full font-medium border ${
                  deepseek.configured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {deepseek.configured ? '● 已连接' : '○ 未配置'}
              </span>
            </div>

            <div className="provider-form-inputs">
              <div>
                <label className="text-xs text-slate-500 block mb-1">模型</label>
                <select
                  className="form-select"
                  value={deepseek.model}
                  onChange={(e) => {
                    const m = e.target.value;
                    setConnections((prev) =>
                      prev.map((item) => (item.provider === 'deepseek' ? { ...item, model: m } : item))
                    );
                  }}
                >
                  {deepseek.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">API Key</label>
                <div className="masked-input-wrapper">
                  <input
                    type={showKey['deepseek'] ? 'text' : 'password'}
                    placeholder={deepseek.maskedKey || '输入 DeepSeek API Key (sk-...)'}
                    value={editKeys['deepseek'] ?? ''}
                    onChange={(e) =>
                      setEditKeys((prev) => ({ ...prev, deepseek: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() =>
                      setShowKey((prev) => ({ ...prev, deepseek: !prev['deepseek'] }))
                    }
                  >
                    {showKey['deepseek'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Base URL</label>
                <input
                  type="text"
                  className="form-input-text bg-slate-50 font-mono"
                  value={deepseek.baseUrl}
                  readOnly
                />
              </div>

              {testResult['deepseek'] && (
                <div
                  className={`text-xs p-2 rounded flex items-center gap-1.5 ${
                    testResult['deepseek'].ok
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult['deepseek'].ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{testResult['deepseek'].message}</span>
                </div>
              )}

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="btn-secondary flex-1 justify-center"
                  disabled={testing === 'deepseek'}
                  onClick={() => handleTest('deepseek')}
                >
                  {testing === 'deepseek' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>测试连接</span>
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1 justify-center"
                  disabled={saving === 'deepseek'}
                  onClick={() => handleSave(deepseek)}
                >
                  {saving === 'deepseek' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>保存配置</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Wan / DashScope */}
        {wan && (
          <div className="provider-card-box">
            <div className="provider-card-top">
              <div className="provider-title-row">
                <div className="provider-icon-badge text-purple-600 bg-purple-50">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="provider-name-title">{wan.name}</h3>
                  <p className="provider-role-desc">{wan.role}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 text-xs rounded-full font-medium border ${
                  wan.configured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {wan.configured ? '● 已连接' : '○ 未配置'}
              </span>
            </div>

            <div className="provider-form-inputs">
              <div>
                <label className="text-xs text-slate-500 block mb-1">模型</label>
                <select
                  className="form-select"
                  value={wan.model}
                  onChange={(e) => {
                    const m = e.target.value;
                    setConnections((prev) =>
                      prev.map((item) => (item.provider === 'wan' ? { ...item, model: m } : item))
                    );
                  }}
                >
                  {wan.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">API Key</label>
                <div className="masked-input-wrapper">
                  <input
                    type={showKey['wan'] ? 'text' : 'password'}
                    placeholder={wan.maskedKey || '输入 DashScope API Key (sk-...)'}
                    value={editKeys['wan'] ?? ''}
                    onChange={(e) =>
                      setEditKeys((prev) => ({ ...prev, wan: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() =>
                      setShowKey((prev) => ({ ...prev, wan: !prev['wan'] }))
                    }
                  >
                    {showKey['wan'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Base URL</label>
                <input
                  type="text"
                  className="form-input-text bg-slate-50 font-mono"
                  value={wan.baseUrl}
                  readOnly
                />
              </div>

              {testResult['wan'] && (
                <div
                  className={`text-xs p-2 rounded flex items-center gap-1.5 ${
                    testResult['wan'].ok
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult['wan'].ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{testResult['wan'].message}</span>
                </div>
              )}

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="btn-secondary flex-1 justify-center"
                  disabled={testing === 'wan'}
                  onClick={() => handleTest('wan')}
                >
                  {testing === 'wan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>测试连接</span>
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1 justify-center"
                  disabled={saving === 'wan'}
                  onClick={() => handleSave(wan)}
                >
                  {saving === 'wan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>保存配置</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card 3: MiniMax */}
        {minimax && (
          <div className="provider-card-box">
            <div className="provider-card-top">
              <div className="provider-title-row">
                <div className="provider-icon-badge text-pink-600 bg-pink-50">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="provider-name-title">{minimax.name}</h3>
                  <p className="provider-role-desc">{minimax.role}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 text-xs rounded-full font-medium border ${
                  minimax.configured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {minimax.configured ? '● 已连接' : '○ 未配置'}
              </span>
            </div>

            <div className="provider-form-inputs">
              <div>
                <label className="text-xs text-slate-500 block mb-1">模型</label>
                <select
                  className="form-select"
                  value={minimax.model}
                  onChange={(e) => {
                    const m = e.target.value;
                    setConnections((prev) =>
                      prev.map((item) => (item.provider === 'minimax' ? { ...item, model: m } : item))
                    );
                  }}
                >
                  {minimax.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">API Key</label>
                <div className="masked-input-wrapper">
                  <input
                    type={showKey['minimax'] ? 'text' : 'password'}
                    placeholder={minimax.maskedKey || '输入 MiniMax API Key (sk-...)'}
                    value={editKeys['minimax'] ?? ''}
                    onChange={(e) =>
                      setEditKeys((prev) => ({ ...prev, minimax: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() =>
                      setShowKey((prev) => ({ ...prev, minimax: !prev['minimax'] }))
                    }
                  >
                    {showKey['minimax'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Base URL</label>
                <input
                  type="text"
                  className="form-input-text bg-slate-50 font-mono"
                  value={minimax.baseUrl}
                  readOnly
                />
              </div>

              {testResult['minimax'] && (
                <div
                  className={`text-xs p-2 rounded flex items-center gap-1.5 ${
                    testResult['minimax'].ok
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult['minimax'].ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{testResult['minimax'].message}</span>
                </div>
              )}

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="btn-secondary flex-1 justify-center"
                  disabled={testing === 'minimax'}
                  onClick={() => handleTest('minimax')}
                >
                  {testing === 'minimax' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>测试连接</span>
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1 justify-center"
                  disabled={saving === 'minimax'}
                  onClick={() => handleSave(minimax)}
                >
                  {saving === 'minimax' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>保存配置</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card 4: Seedance */}
        {seedance && (
          <div className="provider-card-box">
            <div className="provider-card-top">
              <div className="provider-title-row">
                <div className="provider-icon-badge text-slate-700 bg-slate-100">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="provider-name-title">{seedance.name}</h3>
                  <p className="provider-role-desc">{seedance.role}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs rounded-full font-medium border bg-slate-100 text-slate-500 border-slate-200">
                ○ 未配置
              </span>
            </div>

            <div className="provider-form-inputs">
              <div>
                <label className="text-xs text-slate-500 block mb-1">模型</label>
                <select className="form-select" value={seedance.model} disabled>
                  {seedance.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">API Key</label>
                <div className="masked-input-wrapper">
                  <input
                    type="password"
                    placeholder="未配置 (可选接入)"
                    disabled
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Base URL</label>
                <input
                  type="text"
                  className="form-input-text bg-slate-50 font-mono"
                  value={seedance.baseUrl}
                  readOnly
                />
              </div>

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="btn-secondary w-full justify-center"
                  disabled
                >
                  + 配置 API Key (暂未开放)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security Statement Banner */}
      <div className="security-guarantee-card">
        <div className="security-text-content">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p>
            <strong>安全说明：</strong>
            所有 API 密钥仅保存在本机服务端，不会写入浏览器 Local Storage，不会上传到任何第三方服务。你可以随时修改或删除已保存的密钥。
          </p>
        </div>
        <Link href="/" className="btn-primary flex-shrink-0">
          <span>保存并继续</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </LayoutShell>
  );
}
