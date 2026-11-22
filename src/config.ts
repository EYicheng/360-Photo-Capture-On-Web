export const CONFIG = {
  // camera
  defaultWidth: 1920,
  defaultHeight: 1080,

  // full-sphere capture plan
  pitchRowsDeg: [0, 30, -30, 60, -60, 90, -90] as number[],
  baseYawCount: 12,
  minFrames: 6,
  maxFrames: 80,

  // guided aim-and-hold capture
  alignToleranceDeg: 2.5, // yaw & pitch must be within this to count as aligned
  settleMs: 500, // hold aligned for this long before auto-capture

  // stitch
  stitchSourceMaxWidth: 1280, // downscale frames before stitching (memory bound)
  enableAlignment: true, // phase-correlation pairwise alignment (non-AI)
  previewWidth: 1280, // low-res preview (fast FOV feedback)
  previewHeight: 640,
  outputWidth: 4096, // full-res export
  outputHeight: 2048,

  // field of view (getUserMedia does not reliably expose intrinsics)
  defaultHfovDeg: 62,
  hfovMinDeg: 20,
  hfovMaxDeg: 120,
} as const
