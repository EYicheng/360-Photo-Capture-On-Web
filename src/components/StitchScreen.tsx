export function StitchScreen({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100)
  return (
    <div className="screen center-screen">
      <div className="card center">
        <h1>正在生成全景预览…</h1>
        <p className="subtitle">解码照片 → ORB 特征对齐 → 投影拼接，请稍候。</p>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="hint">{pct}%</p>
      </div>
    </div>
  )
}
