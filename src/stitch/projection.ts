import { degToRad } from '../math/angles'
import { mat3Vec3, panoToVector, worldToCamera } from '../math/rotation'

export interface CameraIntrinsics {
  width: number
  height: number
  /** focal length in pixels */
  f: number
  cx: number
  cy: number
}

export function intrinsicsFromHfov(
  width: number,
  height: number,
  hfovDeg: number,
): CameraIntrinsics {
  const f = width / 2 / Math.tan(degToRad(hfovDeg) / 2)
  return { width, height, f, cx: width / 2, cy: height / 2 }
}

export function verticalFov(hfovDeg: number, width: number, height: number): number {
  return 2 * Math.atan(Math.tan(degToRad(hfovDeg) / 2) * (height / width))
}

/**
 * Map a panorama direction to a source pixel.
 * Returns [u, v] in pixel coordinates, or null if outside the frame
 * or behind the camera.
 */
export function panoToPixel(
  theta: number,
  phi: number,
  yaw: number,
  pitch: number,
  roll: number,
  cam: CameraIntrinsics,
): [number, number] | null {
  const uv = projectDirection(theta, phi, yaw, pitch, roll, cam)
  if (!uv) return null
  if (
    uv[0] < 0 ||
    uv[0] >= cam.width ||
    uv[1] < 0 ||
    uv[1] >= cam.height
  ) {
    return null
  }
  return uv
}

/**
 * Like panoToPixel but does not clip to the image bounds. Returns null only
 * when the direction is behind the camera (used for guidance overlays).
 */
export function projectDirection(
  theta: number,
  phi: number,
  yaw: number,
  pitch: number,
  roll: number,
  cam: CameraIntrinsics,
): [number, number] | null {
  const v = panoToVector(theta, phi)
  const [x, y, z] = mat3Vec3(worldToCamera(yaw, pitch, roll), v)
  if (z <= 1e-6) return null
  const u = cam.cx + cam.f * (x / z)
  const vp = cam.cy - cam.f * (y / z)
  return [u, vp]
}
