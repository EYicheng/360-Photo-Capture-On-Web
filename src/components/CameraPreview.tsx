import { useEffect, type RefObject } from 'react'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  className?: string
}

export function CameraPreview({ videoRef, stream, className }: Props) {
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (stream) {
      v.srcObject = stream
      void v.play().catch(() => undefined)
    } else {
      v.srcObject = null
    }
  }, [videoRef, stream])

  return (
    <video
      ref={videoRef}
      className={className}
      muted
      playsInline
      autoPlay
    />
  )
}
