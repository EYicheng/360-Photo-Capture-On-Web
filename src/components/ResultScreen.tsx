import { lazy, Suspense, useEffect, useState } from 'react'
import type { CaptureFlow } from '../hooks/useCaptureFlow'
import { CONFIG } from '../config'
import { downloadBlob } from '../media'
import JSZip from 'jszip'

const PanoramaViewer = lazy(() =>
  import('../viewer/PanoramaViewer').then((m) => ({ default: m.PanoramaViewer })),
)

export function ResultScreen({ flow }: { flow: CaptureFlow }) {
  const [url, setUrl] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)

  useEffect(() => {
    if (!flow.previewResult) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(flow.previewResult.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [flow.previewResult])

  const downloadPanorama = async () => {
    const res = await flow.exportPanorama()
    if (!res) return
    const ext = res.mimeType === 'image/webp' ? 'webp' : 'jpg'
    downloadBlob(res.blob, `panorama-${Date.now()}.${ext}`)
  }

  const downloadFrames = async () => {
    if (flow.frames.length === 0) return
    setZipping(true)
    try {
      const zip = new JSZip()
      flow.frames.forEach((f, i) => {
        zip.file(`frame_${String(i + 1).padStart(2, '0')}.jpg`, f.blob)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `raw-frames-${Date.now()}.zip`)
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="screen result">
      <header className="app-header compact">
        <h1>全景图预览</h1>
        <p className="subtitle">
          拖动 FOV 滑杆实时微调接缝，满意后点击「导出全景图」生成高清图。
        </p>
      </header>

      {flow.flowError && (
        <div className="banner error">
          <p>{flow.flowError}</p>
        </div>
      )}

      {url ? (
        <Suspense fallback={<div className="card center">加载查看器…</div>}>
          <PanoramaViewer key={url} panoramaUrl={url} />
        </Suspense>
      ) : (
        <div className="card center">加载中…</div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="refov">
            视场角（FOV）：<b>{flow.fovDeg}°</b>
            {flow.previewBusy && <span className="hint"> · 更新中…</span>}
          </label>
          <input
            id="refov"
            type="range"
            min={CONFIG.hfovMinDeg}
            max={CONFIG.hfovMaxDeg}
            step={1}
            value={flow.fovDeg}
            onChange={(e) => flow.setFovDeg(Number(e.target.value))}
          />
          <p className="hint">
            {flow.detectedHfov != null
              ? `已自动检测到视场角 ${flow.detectedHfov.toFixed(0)}°，接缝不齐时可微调。`
              : '未检测到相机视场角，可手动微调消除接缝。'}
          </p>
        </div>

        <div className="actions wrap">
          <button
            className="btn primary"
            onClick={() => void downloadPanorama()}
            disabled={flow.exporting}
          >
            {flow.exporting
              ? `导出中… ${Math.round(flow.exportProgress * 100)}%`
              : '导出全景图（高清）'}
          </button>
          <button
            className="btn"
            onClick={() => void downloadFrames()}
            disabled={zipping}
          >
            {zipping ? '打包中…' : '下载原始照片 (zip)'}
          </button>
          <button className="btn ghost" onClick={flow.resetAll}>
            重新拍摄
          </button>
        </div>

        {flow.exporting && (
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.round(flow.exportProgress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
