import { useCallback, useEffect, useRef, useState } from 'react'
import { radToDeg, wrapPi } from '../math/angles'
import { deviceRotationMatrix, orientationFromMatrix } from '../math/orientation'

export interface OrientationInternal {
  /** accumulated (unwrapped) longitude in radians, relative to reset point */
  yaw: number
  /** latitude in radians (+ = up) */
  pitch: number
  /** roll around the optical axis in radians */
  roll: number
}

export type OrientationSupport = 'unknown' | 'supported' | 'unsupported'

const SETTLE_TIMEOUT_MS = 1600

export function useOrientation() {
  const stateRef = useRef<OrientationInternal>({ yaw: 0, pitch: 0, roll: 0 })
  const lastAzRef = useRef<number | null>(null)
  const [support, setSupport] = useState<OrientationSupport>('unknown')
  const [leveling, setLeveling] = useState({ pitchDeg: 0, rollDeg: 0 })

  const reset = useCallback(() => {
    stateRef.current.yaw = 0
    stateRef.current.pitch = 0
    stateRef.current.roll = 0
    lastAzRef.current = null
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const Ctor = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>
    }
    if (typeof Ctor?.requestPermission === 'function') {
      try {
        const res = await Ctor.requestPermission()
        return res === 'granted'
      } catch {
        return false
      }
    }
    return true
  }, [])

  useEffect(() => {
    let received = false
    let lastUi = 0

    const handle = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      if (!received) {
        received = true
        setSupport('supported')
      }

      const R = deviceRotationMatrix(e.alpha, e.beta, e.gamma)
      const { yaw: az, pitch, roll } = orientationFromMatrix(R)

      if (lastAzRef.current == null) {
        lastAzRef.current = az
      } else {
        const delta = wrapPi(az - lastAzRef.current)
        stateRef.current.yaw += delta
        lastAzRef.current = az
      }
      stateRef.current.pitch = pitch
      stateRef.current.roll = roll

      const now = performance.now()
      if (now - lastUi > 100) {
        lastUi = now
        setLeveling({ pitchDeg: radToDeg(pitch), rollDeg: radToDeg(roll) })
      }
    }

    const evtName: 'deviceorientationabsolute' | 'deviceorientation' =
      'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation'
    window.addEventListener(evtName, handle as EventListener)

    const timer = window.setTimeout(() => {
      if (!received) setSupport('unsupported')
    }, SETTLE_TIMEOUT_MS)

    return () => {
      window.removeEventListener(evtName, handle as EventListener)
      window.clearTimeout(timer)
    }
  }, [])

  return { stateRef, leveling, support, requestPermission, reset }
}
