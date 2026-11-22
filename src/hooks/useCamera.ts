import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureError } from '../types'
import { CONFIG } from '../config'
import { bitmapToBlob, canvasToBlob } from '../media'

export interface CameraDevice {
  deviceId: string
  label: string
  facing: 'user' | 'environment' | 'unknown'
}

export interface GrabbedFrame {
  blob: Blob
  width: number
  height: number
}

function mapError(err: unknown): CaptureError {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'permission-denied',
      message: '相机权限被拒绝，请在浏览器设置中允许访问相机。',
    }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { code: 'no-device', message: '未找到可用的相机设备。' }
  }
  if (name === 'SecurityError') {
    return {
      code: 'not-secure',
      message: '当前页面不是安全上下文（HTTPS），浏览器禁止访问相机。请使用 HTTPS 或 localhost。',
    }
  }
  return {
    code: 'generic',
    message: err instanceof Error ? err.message : '相机启动失败。',
  }
}

function inferFacing(d: MediaDeviceInfo): CameraDevice['facing'] {
  const l = (d.label || '').toLowerCase()
  if (l.includes('front')) return 'user'
  if (l.includes('back') || l.includes('rear')) return 'environment'
  return 'unknown'
}

/** Best-effort auto-detection of the camera's horizontal field of view. */
async function detectHfov(track: MediaStreamTrack): Promise<number | null> {
  if (typeof ImageCapture === 'undefined') return null
  try {
    const ic = new ImageCapture(track)
    const caps = (await ic.getPhotoCapabilities()) as unknown as {
      fieldOfView?: { current?: number }
    }
    const fov = caps?.fieldOfView?.current
    // Only accept a plausible horizontal FOV (phones typically 35°–100°).
    if (typeof fov === 'number' && fov >= 35 && fov <= 100) return fov
  } catch {
    /* not supported by this browser/device */
  }
  return null
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const imageCaptureRef = useRef<ImageCapture | null>(null)

  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<CaptureError | null>(null)
  const [starting, setStarting] = useState(false)
  const [ready, setReady] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [detectedHfov, setDetectedHfov] = useState<number | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    imageCaptureRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStream(null)
    setReady(false)
    setDetectedHfov(null)
  }, [])

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices(
        list
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `相机 ${d.deviceId.slice(0, 6)}`,
            facing: inferFacing(d),
          })),
      )
    } catch {
      /* ignore enumeration errors */
    }
  }, [])

  const start = useCallback(
    async (
      deviceId?: string,
      width = CONFIG.defaultWidth,
      height = CONFIG.defaultHeight,
    ) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          code: 'unsupported',
          message: '当前浏览器不支持相机访问。',
        })
        return
      }
      setStarting(true)
      setError(null)
      try {
        stop()
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: width },
            height: { ideal: height },
            ...(deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: 'environment' }),
          },
          audio: false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream
        setStream(stream)
        const track = stream.getVideoTracks()[0]
        setActiveDeviceId(track?.getSettings().deviceId ?? null)

        imageCaptureRef.current = null
        if (track && 'ImageCapture' in window) {
          try {
            imageCaptureRef.current = new ImageCapture(track)
          } catch {
            imageCaptureRef.current = null
          }
        }

        setReady(true)
        await enumerate()

        if (track) {
          void detectHfov(track).then((fov) => {
            if (fov != null) setDetectedHfov(fov)
          })
        }
      } catch (err) {
        setError(mapError(err))
      } finally {
        setStarting(false)
      }
    },
    [stop, enumerate],
  )

  const grabFrame = useCallback(async (): Promise<GrabbedFrame | null> => {
    const ic = imageCaptureRef.current as (ImageCapture & {
      grabFrame?: () => Promise<ImageBitmap>
    }) | null
    if (ic) {
      // Fast path: snapshot of the current frame (no autofocus delay).
      if (typeof ic.grabFrame === 'function') {
        try {
          const bmp = await ic.grabFrame()
          const w = bmp.width
          const h = bmp.height
          const blob = await bitmapToBlob(bmp)
          bmp.close()
          return { blob, width: w, height: h }
        } catch {
          /* fall through */
        }
      }
      // Slower path: still capture (may trigger autofocus/exposure).
      try {
        const blob = await ic.takePhoto()
        return { blob, width: 0, height: 0 }
      } catch {
        /* fall through */
      }
    }
    // Final fallback: draw the current video frame.
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    const blob = await canvasToBlob(canvas)
    return { blob, width: video.videoWidth, height: video.videoHeight }
  }, [])

  useEffect(() => () => stop(), [stop])
  useEffect(() => {
    void enumerate()
  }, [enumerate])

  return {
    videoRef,
    stream,
    devices,
    activeDeviceId,
    error,
    starting,
    ready,
    detectedHfov,
    enumerate,
    start,
    stop,
    grabFrame,
  }
}
