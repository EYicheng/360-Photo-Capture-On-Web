import { useCaptureFlow } from './hooks/useCaptureFlow'
import { CameraSetup } from './components/CameraSetup'
import { CaptureScreen } from './components/CaptureScreen'
import { StitchScreen } from './components/StitchScreen'
import { ResultScreen } from './components/ResultScreen'

export default function App() {
  const flow = useCaptureFlow()

  return (
    <div className="app">
      {flow.phase === 'setup' && <CameraSetup flow={flow} />}
      {flow.phase === 'capturing' && <CaptureScreen flow={flow} />}
      {flow.phase === 'stitching' && (
        <StitchScreen progress={flow.stitchProgress} />
      )}
      {flow.phase === 'done' && <ResultScreen flow={flow} />}
    </div>
  )
}
