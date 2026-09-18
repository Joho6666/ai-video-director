import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function BenchmarkPage() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px', color: '#e2e8f0', fontFamily: 'system-ui' }}>
      <p><Link href="/">← 返回创作工作台</Link></p>
      <h1>Benchmark · Real Validation</h1>
      <p>该页面只展示本地落盘的 Real Benchmark 运行记录；Synthetic 结果不会被当作真实视频证据。</p>
      <section id="benchmark-dashboard" style={{ marginTop: 32, padding: 24, border: '1px solid #334155', borderRadius: 12 }}>
        <p>加载实验记录…</p>
        <script dangerouslySetInnerHTML={{ __html: `fetch('/api/benchmark').then(r=>r.json()).then(data=>{const el=document.getElementById('benchmark-dashboard');const runs=data.runs||[];el.innerHTML='<h2>Recent runs</h2>'+(runs.length?'<ul>'+runs.map(r=>'<li>'+String(r.run_id||'unknown')+' · '+String(r.provider||'unknown')+' · '+String(r.mode||'unknown')+'</li>').join('')+'</ul>':'<p>暂无 Real Benchmark 记录。</p>')+'<h2>Failure distribution</h2><pre>'+JSON.stringify(data.failureStats||{},null,2)+'</pre>'}).catch(()=>{document.getElementById('benchmark-dashboard').innerHTML='<p>无法读取 Benchmark 记录。</p>'})` }} />
      </section>
    </main>
  );
}
