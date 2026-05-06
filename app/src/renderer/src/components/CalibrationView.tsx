import { useState } from 'react'
import { CalibrationWizard } from './CalibrationWizard'
import { CalibrationHistory } from './CalibrationHistory'
import { PressStatusBar } from './PressStatusBar'

export function CalibrationView() {
  const [mode, setMode] = useState<'history' | 'new'>('history')
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-4">
        <PressStatusBar />
      </div>
      {mode === 'new' ? (
        <CalibrationWizard onDone={() => setMode('history')} />
      ) : (
        <CalibrationHistory onNew={() => setMode('new')} />
      )}
    </div>
  )
}
