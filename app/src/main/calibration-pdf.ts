import PDFDocument from 'pdfkit'
import { app } from 'electron'
import { promises as fsp, createWriteStream } from 'node:fs'
import path from 'node:path'
import type { Calibration } from '../shared/types'

const FOOTER_NOTES = `Repetitividade:
Variação das medidas obtidas por um único operador, utilizando o mesmo equipamento de medição e método, ao medir repetidas vezes uma mesma grandeza de uma única peça (corpo de prova).

Célula de Carga da marca Alfa Instrumentos, número 1141609, modelo C 200T, ano de fabricação 2011, que atende aos requisitos específicos, sendo realizada a calibração pelo Laboratório Isaac Newton, Laboratório de Calibração Acreditado pela CGCRE / INMETRO de acordo com NBR ISO/IEC 17025, sob o número CAL 0045, integrante da Rede Brasileira de Calibração (RBC), calibração a compressão segundo NBR ISO 376:2012 e Procedimento Tecnico CETEC SENAI PT 1102 (V.1.0) PR-003. (Indicador Digital marca Alfa Instrumentos, nº 1092F5, modelo 3101C - Ano 2011).
Certificado de Calibração Nº 1240346 - CETEC / SENAI / FIEMG.`

export async function generateCalibrationPdf(cal: Calibration): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'calibracoes')
  await fsp.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${cal.numero}.pdf`)

  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  const stream = createWriteStream(filePath)
  doc.pipe(stream)

  // Cabeçalho
  doc.fontSize(16).font('Helvetica-Bold').text('CALIBRAÇÃO COMPRESSÃO LEITOR DIGITAL', { align: 'center' })
  doc.moveDown()

  doc.fontSize(10).font('Helvetica')
  const header: Array<[string, string]> = [
    ['Número:', cal.numero],
    ['Identificação:', cal.identificacao ?? ''],
    ['Equipamento:', cal.equipamento_nome],
    ['Carga Digital:', `${cal.carga_digital_ton ?? ''} Toneladas`],
    ['Transdutor de pressão:', `Marca: ${cal.transdutor_marca ?? ''}`],
    ['Escala:', `${cal.escala_min_kgf} a ${cal.escala_max_kgf} Kgf`],
    ['Validade:', cal.validade],
    ['Temperatura Ambiente:', cal.temperatura_celsius != null ? `${cal.temperatura_celsius} °C` : ''],
    ['Calibrado por:', cal.calibrado_por ?? '']
  ]
  for (const [k, v] of header) {
    doc.font('Helvetica-Bold').text(k, { continued: true }).font('Helvetica').text(' ' + v)
  }

  doc.moveDown()

  // Tabela
  const startX = 40
  let y = doc.y
  const cols: Array<{ label: string; w: number }> = [
    { label: 'Carga Real\n(Kgf)', w: 65 },
    { label: '1ª Leitura', w: 60 },
    { label: '2ª Leitura', w: 60 },
    { label: '3ª Leitura', w: 60 },
    { label: 'Média', w: 60 },
    { label: 'Desvio\nPadrão', w: 55 },
    { label: 'Erro\nExatidão %', w: 65 },
    { label: 'Repetit.\n(%)', w: 60 }
  ]
  doc.font('Helvetica-Bold').fontSize(8)
  let x = startX
  for (const c of cols) {
    doc.rect(x, y, c.w, 30).stroke()
    doc.text(c.label, x + 2, y + 6, { width: c.w - 4, align: 'center' })
    x += c.w
  }
  y += 30

  doc.font('Helvetica').fontSize(9)
  for (const p of cal.points) {
    x = startX
    const cells = [
      String(p.carga_real_kgf),
      fmt(p.leitura_1_kgf),
      fmt(p.leitura_2_kgf),
      fmt(p.leitura_3_kgf),
      fmt(p.media_kgf),
      fmt(p.desvio_padrao),
      fmt(p.erro_exatidao_pct),
      fmt(p.repetitividade_pct)
    ]
    for (let i = 0; i < cols.length; i++) {
      doc.rect(x, y, cols[i].w, 20).stroke()
      doc.text(cells[i], x + 2, y + 6, { width: cols[i].w - 4, align: 'center' })
      x += cols[i].w
    }
    y += 20
  }

  doc.y = y + 20
  doc.fontSize(8).font('Helvetica').text(FOOTER_NOTES, 40, doc.y, { align: 'justify', width: 515 })

  doc.moveDown(3)
  doc.fontSize(10).text('_______________________________', { align: 'center' })
  doc.text(cal.calibrado_por ?? '', { align: 'center' })

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', reject)
  })
  return filePath
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
