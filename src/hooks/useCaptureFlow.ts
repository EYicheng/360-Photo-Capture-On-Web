import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './useCamera'
import { useOrientation } from './useOrientation'
import { CONFIG } from '../config'
import type { FrameMeta, StitchResult, TargetAngle } from '../types'
import {
  allCaptured,
  buildSphereTargets,
  nextUncaptured,
} from '../capture/segmentPlanner'
import { angularDistance, degToRad } from '../math/angles'
import {
  decodeFrames,
  stitchDecoded,
  type DecodedFrame,
} from '../stitch/stitcher'
import { refineRotations, type RefinedOrientation } from '../stitch/align'
import {
  CALIB_DELTA_YAW_RAD,
  CALIB_DOWN_H,
  CALIB_DOWN_W,
  columnProfile,
  estimateHfov,
  measureShift1d,
} from '../stitch/calibration'

export type Phase = 'setup' | 'capturing' | 'stitching' | 'done'

export type CaptureFlow = ReturnType<typeof useCaptureFlow>

export interface OrientationSnapshot {
  yaw: number
  pitch: number
  roll: number
}

export function useCaptureFlow() {
  const camera = useCamera()
  const orientation = useOrientation()

  const [phase, setPhase] = useState<Phase>('setup')
  const [targets, setTargets] = useState<TargetAngle[]>([])
  const [frames, setFrames] = useState<FrameMeta[]>([])
  const [fovDeg, setFovDeg] = useState<number>(CONFIG.defaultHfovDeg)
  const [stitchProgress, setStitchProgress] = useState(0)
  const [previewResult, setPreviewResult] = useState<StitchResult | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [autoMode, setAutoMode] = useState(true)
  const [busy, setBusy] = useState(false)
  const [flowError, setFlowError] = useState<string | null>(null)

  const targetsRef = useRef(targets)
  const framesRef = useRef(frames)
  const fovDegRef = useRef(fovDeg)
  const busyRef = useRef(false)
  const idRef = useRef(0)
  const stableMsRef = useRef(0)
  const alignedRef = useRef(false)
  const orientSupportRef = useRef(false)
  const decodedRef = useRef<DecodedFrame[] | null>(null)
  const orientationsRef = useRef<RefinedOrientation[] | null>(null)
  const skipPreviewRef = useRef(false)
  const previewReqRef = useRef(0)
  const fovSamplesRef = useRef<number[]>([])
  const calibRef = useRef<{ profile: Float32Array; pitch: number } | null>(null)

  useEffect(() => {
    targetsRef.current = targets
  }, [targets])
  useEffect(() => {
    framesRef.current = frames
  }, [frames])
  useEffect(() => {
    fovDegRef.current = fovDeg
  }, [fovDeg])
  useEffect(() => {
    orientSupportRef.current = orientation.support === 'supported'
  }, [orientation.support])

  useEffect(() => {
    if (phase === 'done') camera.stop()
  }, [phase, camera.stop])

  // Auto-set FOV whenever the camera reports it (handles camera switches too).
  useEffect(() => {
    if (camera.detectedHfov != null) {
      setFovDeg(Math.round(camera.detectedHfov))
    }
  }, [camera.detectedHfov])

  const markCaptured = useCallback((index: number, frameId: number) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.index === index ? { ...t, captured: true, frameId } : t,
      ),
    )
  }, [])

  // On-the-fly FOV calibration: measure horizontal scene shift between
  // consecutive shots of the horizontal row and derive the real FOV.
  const calibrateFromVideo = useCallback(
    (pitch: number) => {
      const video = camera.videoRef.current
      if (!video || video.videoWidth === 0) return
      const canvas = document.createElement('canvas')
      canvas.width = CALIB_DOWN_W
      canvas.height = CALIB_DOWN_H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, CALIB_DOWN_W, CALIB_DOWN_H)
      const img = ctx.getImageData(0, 0, CALIB_DOWN_W, CALIB_DOWN_H)
      const profile = columnProfile(img.data, CALIB_DOWN_W, CALIB_DOWN_H)

      const prev = calibRef.current
      const horizontal =
        Math.abs(pitch) < degToRad(10) &&
        prev != null &&
        Math.abs(prev.pitch) < degToRad(10)
      if (horizontal) {
        const res = measureShift1d(
          prev.profile,
          profile,
          CALIB_DOWN_W / 2,
          CALIB_DOWN_W / 8,
          90,
        )
        if (res && Math.abs(res.shift) > 2) {
          const hfov = estimateHfov(
            Math.abs(res.shift),
            CALIB_DELTA_YAW_RAD,
            CALIB_DOWN_W,
          )
          if (hfov >= 30 && hfov <= 110) {
            fovSamplesRef.current.push(hfov)
            if (fovSamplesRef.current.length >= 3) {
              const sorted = [...fovSamplesRef.current].sort((a, b) => a - b)
              const median = sorted[Math.floor(sorted.length / 2)]
              setFovDeg(Math.round(median))
              fovSamplesRef.current = []
            }
          }
        }
      }
      calibRef.current = { profile, pitch }
    },
    [camera.videoRef],
  )

  const captureAt = useCallback(
    async (target: TargetAngle, o?: OrientationSnapshot) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const fr = await camera.grabFrame()
        if (!fr) return
        const meta: FrameMeta = {
          id: ++idRef.current,
          blob: fr.blob,
          width: fr.width,
          height: fr.height,
          // Snap to the exact target yaw/pitch (drift-free). Using the raw
          // accumulated gyro yaw here would let gyro drift rotate frames
          // relative to each other and cause ghosting.
          yaw: target.yaw,
          pitch: target.pitch,
          roll: o?.roll ?? 0,
          ts: Date.now(),
        }
        setFrames((prev) => [...prev, meta])
        markCaptured(target.index, meta.id)
        calibrateFromVideo(target.pitch)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [camera.grabFrame, markCaptured, calibrateFromVideo],
  )

  const startCapture = useCallback(() => {
    orientation.reset()
    stableMsRef.current = 0
    alignedRef.current = false
    decodedRef.current = null
    orientationsRef.current = null
    fovSamplesRef.current = []
    calibRef.current = null
    setTargets(buildSphereTargets(CONFIG.pitchRowsDeg, CONFIG.baseYawCount))
    setFrames([])
    setPreviewResult(null)
    setFlowError(null)
    setPhase('capturing')
  }, [orientation.reset])

  const captureManual = useCallback(async () => {
    const next = nextUncaptured(targetsRef.current)
    if (!next) return
    const o = orientation.stateRef.current
    const snap: OrientationSnapshot | undefined = orientSupportRef.current
      ? { yaw: o.yaw, pitch: o.pitch, roll: o.roll }
      : undefined
    await captureAt(next, snap)
  }, [captureAt, orientation])

  // decode once, then produce a low-res preview and enter the result screen
  const finish = useCallback(() => {
    const fs = framesRef.current
    if (fs.length < CONFIG.minFrames) return
    setPhase('stitching')
    setFlowError(null)
    setStitchProgress(0)
    skipPreviewRef.current = true
    void (async () => {
      try {
        if (!decodedRef.current) {
          decodedRef.current = await decodeFrames(
            fs,
            CONFIG.stitchSourceMaxWidth,
            (r) => setStitchProgress(r * 0.35),
          )
          if (CONFIG.enableAlignment) {
            orientationsRef.current = refineRotations(
              decodedRef.current,
              fovDegRef.current,
              (r) => setStitchProgress(0.35 + r * 0.2),
            )
          }
        }
        const res = await stitchDecoded(decodedRef.current, {
          hfovDeg: fovDegRef.current,
          outputWidth: CONFIG.previewWidth,
          outputHeight: CONFIG.previewHeight,
          orientations: orientationsRef.current ?? undefined,
          onProgress: (r) => setStitchProgress(0.55 + r * 0.45),
        })
        setPreviewResult(res)
        setPhase('done')
      } catch (e) {
        setFlowError(e instanceof Error ? e.message : '拼接失败')
        setPhase('capturing')
      }
    })()
  }, [])

  // debounced low-res re-preview when FOV changes while viewing the result
  useEffect(() => {
    if (phase !== 'done') return
    if (skipPreviewRef.current) {
      skipPreviewRef.current = false
      return
    }
    const dec = decodedRef.current
    if (!dec || dec.length < CONFIG.minFrames) return
    setPreviewBusy(true)
    const id = previewReqRef.current + 1
    previewReqRef.current = id
    const timer = window.setTimeout(() => {
      void stitchDecoded(dec, {
        hfovDeg: fovDegRef.current,
        outputWidth: CONFIG.previewWidth,
        outputHeight: CONFIG.previewHeight,
        orientations: orientationsRef.current ?? undefined,
      })
        .then((res) => {
          if (previewReqRef.current === id) setPreviewResult(res)
        })
        .catch((e) =>
          setFlowError(e instanceof Error ? e.message : '拼接失败'),
        )
        .finally(() => {
          if (previewReqRef.current === id) setPreviewBusy(false)
        })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [fovDeg, phase])

  // full-resolution export on demand
  const exportPanorama = useCallback(async (): Promise<StitchResult | null> => {
    const dec = decodedRef.current
    if (!dec || dec.length < CONFIG.minFrames) return null
    setExporting(true)
    setExportProgress(0)
    try {
      const res = await stitchDecoded(dec, {
        hfovDeg: fovDegRef.current,
        outputWidth: CONFIG.outputWidth,
        outputHeight: CONFIG.outputHeight,
        orientations: orientationsRef.current ?? undefined,
        onProgress: setExportProgress,
      })
      return res
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : '拼接失败')
      return null
    } finally {
      setExporting(false)
    }
  }, [])

  // guided aim-and-hold auto-capture loop
  useEffect(() => {
    if (phase !== 'capturing' || !autoMode) return
    let raf = 0
    let last = performance.now()

    const loop = (now: number) => {
      const dt = now - last
      last = now

      const t = targetsRef.current
      if (allCaptured(t)) {
        finish()
        return
      }
      const next = nextUncaptured(t)
      if (!next) {
        raf = requestAnimationFrame(loop)
        return
      }

      const o = orientation.stateRef.current
      const dyaw = Math.abs(angularDistance(o.yaw, next.yaw))
      const dpitch = Math.abs(o.pitch - next.pitch)
      const tol = degToRad(CONFIG.alignToleranceDeg)
      // At the poles yaw degenerates (gimbal lock), so align on pitch only.
      const isPole = Math.abs(next.pitch) >= degToRad(85)
      const aligned = isPole ? dpitch <= tol : dyaw <= tol && dpitch <= tol
      alignedRef.current = aligned

      if (aligned) {
        stableMsRef.current += dt
        if (stableMsRef.current >= CONFIG.settleMs) {
          stableMsRef.current = 0
          void captureAt(next, { yaw: o.yaw, pitch: o.pitch, roll: o.roll })
        }
      } else {
        stableMsRef.current = 0
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, autoMode, captureAt, orientation, finish])

  const resetAll = useCallback(() => {
    setTargets([])
    setFrames([])
    setPreviewResult(null)
    setFlowError(null)
    setStitchProgress(0)
    setExportProgress(0)
    decodedRef.current = null
    orientationsRef.current = null
    setPhase('setup')
  }, [])

  const currentTarget = nextUncaptured(targets)

  return {
    // camera
    videoRef: camera.videoRef,
    stream: camera.stream,
    devices: camera.devices,
    activeDeviceId: camera.activeDeviceId,
    cameraError: camera.error,
    cameraStarting: camera.starting,
    cameraReady: camera.ready,
    detectedHfov: camera.detectedHfov,
    startCamera: camera.start,
    stopCamera: camera.stop,
    // orientation
    orientationRef: orientation.stateRef,
    leveling: orientation.leveling,
    orientationSupport: orientation.support,
    requestOrientationPermission: orientation.requestPermission,
    // flow
    phase,
    targets,
    frames,
    fovDeg,
    setFovDeg,
    stitchProgress,
    previewResult,
    previewBusy,
    exporting,
    exportProgress,
    autoMode,
    setAutoMode,
    busy,
    flowError,
    currentTarget,
    stableMsRef,
    alignedRef,
    startCapture,
    captureManual,
    finish,
    exportPanorama,
    resetAll,
    allCaptured: allCaptured(targets),
  }
}
