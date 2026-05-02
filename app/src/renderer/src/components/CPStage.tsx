import { useEffect, useState } from 'react'
import { useSession } from '../store/session'
import { formatTon, formatKgf } from '../lib/format'
import cpIntactoPng from '../../../../resources/cp-intacto.png'
import cpRompidoPng from '../../../../resources/cp-rompido.png'

export function CPStage() {
  const { state } = useSession()
  const phase = state.phase
  const isLoading = phase === 'loading'
  const isRuptured = phase === 'ruptured' || phase === 'sealed'

  const [shouldShake, setShouldShake] = useState(false)

  useEffect(() => {
    setShouldShake(isLoading && state.press.current_kgf > 1500)
  }, [isLoading, state.press.current_kgf])

  if (!state.selectedSpecimenId) {
    return (
      <section className="flex-1 flex items-center justify-center text-center p-12">
        <div className="max-w-md">
          <div className="label-mute mb-3">Aguardando selecao</div>
          <h2 className="text-bs-text text-lg mb-2">Escolhe um CP da fila</h2>
          <p className="text-bs-text-mute text-sm">
            Os CPs marcados como MOLDED com vencimento prximo aparecem na lateral. Clique pra
            posicionar no palco.
          </p>
        </div>
      </section>
    )
  }

  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-12 relative overflow-hidden bg-gradient-to-b from-bs-bg to-[#0c1218]">
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          background:
            'radial-gradient(circle at 50% 60%, rgba(88,166,255,0.10) 0%, transparent 60%)',
          opacity: isLoading ? 1 : 0.3
        }}
      />

      {/* Stage com cross-fade */}
      <div className="grid place-items-center" style={{ gridTemplateAreas: '"a"' }}>
        <img
          src={cpIntactoPng}
          alt="CP intacto"
          className={`block ${shouldShake ? 'animate-shake' : 'animate-float'}`}
          style={{
            gridArea: 'a',
            maxHeight: 460,
            transition: 'opacity 0.6s ease-in-out',
            opacity: isRuptured ? 0 : 1,
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))'
          }}
        />
        <img
          src={cpRompidoPng}
          alt="CP rompido"
          className="block animate-float"
          style={{
            gridArea: 'a',
            maxHeight: 460,
            transition: 'opacity 0.6s ease-in-out',
            opacity: isRuptured ? 1 : 0,
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))'
          }}
        />
      </div>

      {/* Codigo do CP */}
      <div className="mt-6 text-center">
        <div className="text-bs-text font-medium text-lg tracking-tight">
          {sp?.specimen_code}
        </div>
        <div className="text-bs-text-mute text-sm">
          {sp?.project_name} · Lote {sp?.batch_code} · {sp?.test_age_days}d
        </div>
      </div>

      {/* Live readings */}
      <div className="mt-6 flex gap-8 items-baseline">
        <ReadingMetric
          label="Carga"
          value={formatTon(state.press.current_kgf, 2)}
          unit="ton"
          big
        />
        <ReadingMetric label="Pico" value={formatTon(state.press.peak_kgf, 2)} unit="ton" />
        <ReadingMetric label="kgf" value={formatKgf(state.press.current_kgf)} unit="" />
        <ReadingMetric
          label="Amostras"
          value={String(state.press.reading_count)}
          unit=""
        />
      </div>
    </section>
  )
}

function ReadingMetric({
  label,
  value,
  unit,
  big = false
}: {
  label: string
  value: string
  unit: string
  big?: boolean
}) {
  return (
    <div className="text-center">
      <div className="label-mute mb-1">{label}</div>
      <div
        className={`font-mono text-bs-text tabular-nums ${
          big ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {value}
        {unit && <span className="text-bs-text-mute text-sm ml-1">{unit}</span>}
      </div>
    </div>
  )
}
