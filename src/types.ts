export type Vec3 = [number, number, number]

export interface FrameMeta {
  /** unique id */
  id: number
  /** raw JPEG blob */
  blob: Blob
  width: number
  height: number
  /** longitude, radians (unwrapped) */
  yaw: number
  /** latitude, radians (+ = up) */
  pitch: number
  /** roll around optical axis, radians */
  roll: number
  ts: number
}

export interface TargetAngle {
  index: number
  yaw: number
  pitch: number
  captured: boolean
  frameId?: number
}

export type CaptureStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'capturing'
  | 'stitching'
  | 'done'
  | 'error'

export interface CaptureError {
  code:
    | 'permission-denied'
    | 'no-device'
    | 'not-secure'
    | 'unsupported'
    | 'generic'
  message: string
}

export interface StitchResult {
  blob: Blob
  width: number
  height: number
  /** JPEG or WebP */
  mimeType: string
}
