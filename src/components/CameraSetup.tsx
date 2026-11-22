import { useState } from 'react'
import type { CaptureFlow } from '../hooks/useCaptureFlow'
import { CONFIG } from '../config'
import { buildSphereTargets } from '../capture/segmentPlanner'
import { CameraPreview } from './CameraPreview'

function needsIosPermission(): boolean {
  const Ctor = DeviceOrientationEvent as unknown as {
    requestPermission?: unknown
  }
  return typeof Ctor?.requestPermission === 'function'
}

export function CameraSetup({ flow }: { flow: CaptureFlow }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [permBusy, setPermBusy] = useState(false)
  const [permResult, setPermResult] = useState<string | null>(null)

  const handleStartCamera = () => void flow.startCamera(selectedDeviceId || undefined)

  const handleEnableGyro = async () => {
    setPermBusy(true)
    setPermResult(null)
    const ok = await flow.requestOrientationPermission()
    setPermResult(ok ? '已启用陀螺仪，请保持手机竖直并旋转。' : '未获得陀螺仪权限，将使用手动模式。')
    setPermBusy(false)
  }

  return (
    <div className="screen setup">
      <header className="app-header">
        <h1>360° 全景照片拍摄</h1>
        <p className="subtitle">
          对准引导方向拍摄多角度照片，拼接成完整球面全景图（VR 可看）。
        </p>
      </header>

      {flow.cameraError && (
        <div className="banner error">
          <strong>无法访问相机</strong>
          <p>{flow.cameraError.message}</p>
        </div>
      )}

      {!flow.cameraReady ? (
        <div className="card">
          <div className="field">
            <label htmlFor="device">选择相机</label>
            <select
              id="device"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              <option value="">默认（后置）</option>
              {flow.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn primary big"
            onClick={handleStartCamera}
            disabled={flow.cameraStarting}
          >
            {flow.cameraStarting ? '启动中…' : '启动相机'}
          </button>
        </div>
      ) : (
        <div className="setup-ready">
          <CameraPreview
            videoRef={flow.videoRef}
            stream={flow.stream}
            className="preview"
          />

          <div className="card">
            <div className="field">
              <label htmlFor="device">相机</label>
              <select
                id="device"
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value)
                  void flow.startCamera(e.target.value || undefined)
                }}
              >
                <option value="">默认（后置）</option>
                {flow.devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="fov">
                视场角（FOV）：<b>{flow.fovDeg}°</b>
              </label>
              <input
                id="fov"
                type="range"
                min={CONFIG.hfovMinDeg}
                max={CONFIG.hfovMaxDeg}
                step={1}
                value={flow.fovDeg}
                onChange={(e) => flow.setFovDeg(Number(e.target.value))}
              />
              <p className="hint">
                {flow.detectedHfov != null
                  ? `已自动检测到视场角 ${flow.detectedHfov.toFixed(0)}°。`
                  : '未检测到视场角，使用默认值。'}
                接缝不齐可在结果页实时微调。
              </p>
            </div>

            <div className="gyro-status">
              {flow.orientationSupport === 'supported' && (
                <p className="ok">✓ 已检测到陀螺仪，将引导你逐一对准方向并自动拍摄。</p>
              )}
              {flow.orientationSupport === 'unknown' && (
                <p>正在检测陀螺仪…</p>
              )}
              {flow.orientationSupport === 'unsupported' && (
                <>
                  <p>未检测到陀螺仪（桌面端将使用手动模式）。</p>
                  {needsIosPermission() && (
                    <button
                      className="btn ghost"
                      onClick={handleEnableGyro}
                      disabled={permBusy}
                    >
                      {permBusy ? '请求中…' : '启用陀螺仪（iOS）'}
                    </button>
                  )}
                </>
              )}
              {permResult && <p className="hint">{permResult}</p>}
            </div>

            <button className="btn primary big" onClick={flow.startCapture}>
              开始拍摄（约 {buildSphereTargets(CONFIG.pitchRowsDeg, CONFIG.baseYawCount).length} 个方向）
            </button>
          </div>
        </div>
      )}

      <footer className="footnote">
        所有照片仅在本地浏览器内处理，不会上传服务器。
      </footer>
    </div>
  )
}
