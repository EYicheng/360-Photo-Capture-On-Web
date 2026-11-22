import { useEffect, useRef } from 'react'
import { Viewer } from '@photo-sphere-viewer/core'
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin'
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin'
import '@photo-sphere-viewer/core/index.css'

export function PanoramaViewer({ panoramaUrl }: { panoramaUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const viewer = new Viewer({
      container: el,
      navbar: ['zoom', 'fullscreen', 'gyroscope', 'autorotate'],
      minFov: 20,
      maxFov: 120,
      defaultZoomLvl: 30,
      plugins: [[GyroscopePlugin, { touchmove: true }], AutorotatePlugin],
    })
    viewerRef.current = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // load / reload the panorama without recreating the viewer (smooth preview)
  useEffect(() => {
    const v = viewerRef.current
    if (v) void v.setPanorama(panoramaUrl, { transition: false })
  }, [panoramaUrl])

  return <div ref={containerRef} className="panorama-viewer" />
}
