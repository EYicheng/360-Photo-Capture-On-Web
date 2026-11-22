import type { CaptureFlow } from '../hooks/useCaptureFlow'
import { CONFIG } from '../config'
import { CameraPreview } from './CameraPreview'
import { GuidanceOverlay } from './GuidanceOverlay'
import { ProgressRing } from './ProgressRing'

export function CaptureScreen({ flow }: { flow: CaptureFlow }) {
  const captured = flow.targets.filter((t) => t.captured).length
  const total = flow.targets.length
  const canFinish = flow.frames.length >= CONFIG.minFrames
  const gyro = flow.orientationSupport === 'supported'
  const roll = flow.leveling.rollDeg
  const levelOk = Math.abs(roll) < 8

  return (
    <div className="screen capture">
      <header className="app-header compact">
        <h1>对准目标拍摄</h1>
        <p className="subtitle">
          将手机对准画面中的目标方向，站定片刻会自动拍摄；用箭头引导方向。
        </p>
      </header>

      <div className="preview-wrap">
        <CameraPreview
          videoRef={flow.videoRef}
          stream={flow.stream}
          className="preview capture-preview"
        />
        {gyro && (
          <GuidanceOverlay
            videoRef={flow.videoRef}
            orientationRef={flow.orientationRef}
            target={flow.currentTarget}
            fovDeg={flow.fovDeg}
            stableMsRef={flow.stableMsRef}
            hasOrientation
          />
        )}
        <span className="badge">{flow.autoMode && gyro ? '自动拍摄' : '手动拍摄'}</span>
      </div>

      {flow.flowError && (
        <div className="banner error">
          <p>{flow.flowError}</p>
        </div>
      )}

      <div className="card">
        <div className="capture-stats">
          <ProgressRing targets={flow.targets} />
          <div className="capture-meta">
            <p>
              已拍摄 <b>{captured}</b> / {total}
            </p>
            {flow.currentTarget && (
              <p className="hint">
                目标俯仰角：{Math.round((flow.currentTarget.pitch * 180) / Math.PI)}°
              </p>
            )}
            <p className={`hint ${levelOk ? 'ok' : 'warn'}`}>
              {levelOk ? '水平状态良好' : `请保持手机水平（当前倾斜 ${roll.toFixed(0)}°）`}
            </p>
          </div>
        </div>

        {gyro && (
          <div className="mode-switch">
            <button
              className={flow.autoMode ? 'chip active' : 'chip'}
              onClick={() => flow.setAutoMode(true)}
            >
              自动（对准后自动拍）
            </button>
            <button
              className={!flow.autoMode ? 'chip active' : 'chip'}
              onClick={() => flow.setAutoMode(false)}
            >
              手动（对准后点拍）
            </button>
          </div>
        )}

        {!gyro && (
          <p className="hint center">
            桌面端无陀螺仪：请原地转动/俯仰，每到一个位置点击一次「拍摄一张」。
          </p>
        )}

        <div className="actions">
          {(!gyro || !flow.autoMode) && (
            <button
              className="btn primary"
              onClick={() => void flow.captureManual()}
              disabled={flow.busy || flow.allCaptured}
            >
              {flow.busy ? '拍摄中…' : '拍摄一张'}
            </button>
          )}
          <button className="btn accent" onClick={flow.finish} disabled={!canFinish}>
            完成并拼接
          </button>
          <button className="btn ghost" onClick={flow.resetAll}>
            取消
          </button>
        </div>

        {!canFinish && (
          <p className="hint center">
            至少需要 {CONFIG.minFrames} 张照片才能拼接。
          </p>
        )}
      </div>
    </div>
  )
}
