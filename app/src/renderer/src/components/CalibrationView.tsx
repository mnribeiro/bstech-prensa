import { useState } from 'react'
import { CalibrationWizard } from './CalibrationWizard'
import { CalibrationHistory } from './CalibrationHistory'

export function CalibrationView() {
  const [mode, setMode] = useState<'history' | 'new'>('history')
  if (mode === 'new') return <CalibrationWizard onDone={() => setMode('history')} />
  return <CalibrationHistory onNew={() => setMode('new')} />
}
