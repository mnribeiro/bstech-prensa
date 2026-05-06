// Dados demo pra rodar o app sem precisar de auth no Supabase.
// Ativa via VITE_BSTECH_DEMO=1 (ja setado no script `npm run dev`).
// Usado APENAS no renderer — main process e RPC nao sao tocados.

import type { Specimen, Operator, LabEquipment } from '@shared/types'

const today = new Date()
const isoOffset = (days: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const DEMO_OPERATORS: Operator[] = [
  { id: 'op-demo-1', name: 'Miguel Ribeiro', role: 'rupture', client_id: 'demo' },
  { id: 'op-demo-2', name: 'Marcelo Bertelli', role: 'rupture', client_id: 'demo' },
  { id: 'op-demo-3', name: 'Tecnico A', role: 'rupture', client_id: 'demo' }
]

export const DEMO_EQUIPMENTS: LabEquipment[] = [
  {
    id: 'eq-demo-1',
    name: 'Prensa Novus N1500-LC',
    manufacturer: 'Novus / Marcelo Bertelli',
    model: 'PC-150T',
    serial_number: 'BS-2026-001',
    capacity_kn: 1500,
    machine_class: 'Classe 1',
    certificate_id: 'CERT-2026-042',
    calibration_due_date: '2027-04-30'
  }
]

export const DEMO_SPECIMENS: Specimen[] = [
  {
    id: 'sp-demo-1',
    specimen_code: 'L-014-1-28D',
    status: 'MOLDED',
    test_age_days: 28,
    due_date: isoOffset(0),
    specimen_diameter_mm: 100,
    specimen_height_mm: 200,
    weight_kg: 3.85,
    height_diameter_ratio: 2.0,
    correction_factor: 1.0,
    project_id: 'proj-demo-1',
    batch_id: 'b-demo-1',
    project_name: 'Edificio Aurora — Pilotis L3',
    batch_code: 'L-014',
    fck_spec_mpa: 30,
    structure_name: null,
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: null,
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null
  },
  {
    id: 'sp-demo-2',
    specimen_code: 'L-014-2-28D',
    status: 'MOLDED',
    test_age_days: 28,
    due_date: isoOffset(0),
    specimen_diameter_mm: 100,
    specimen_height_mm: 200,
    weight_kg: 3.91,
    height_diameter_ratio: 2.0,
    correction_factor: 1.0,
    project_id: 'proj-demo-1',
    batch_id: 'b-demo-1',
    project_name: 'Edificio Aurora — Pilotis L3',
    batch_code: 'L-014',
    fck_spec_mpa: 30,
    structure_name: null,
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: null,
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null
  },
  {
    id: 'sp-demo-3',
    specimen_code: 'L-015-1-7D',
    status: 'MOLDED',
    test_age_days: 7,
    due_date: isoOffset(0),
    specimen_diameter_mm: 100,
    specimen_height_mm: 200,
    weight_kg: 3.76,
    height_diameter_ratio: 2.0,
    correction_factor: 1.0,
    project_id: 'proj-demo-2',
    batch_id: 'b-demo-2',
    project_name: 'Casa Verde Familias II',
    batch_code: 'L-015',
    fck_spec_mpa: 25,
    structure_name: null,
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: null,
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null
  },
  {
    id: 'sp-demo-4',
    specimen_code: 'L-013-3-28D',
    status: 'MOLDED',
    test_age_days: 28,
    due_date: isoOffset(-1),
    specimen_diameter_mm: 100,
    specimen_height_mm: 198,
    weight_kg: 3.83,
    height_diameter_ratio: 1.98,
    correction_factor: 0.997,
    project_id: 'proj-demo-3',
    batch_id: 'b-demo-3',
    project_name: 'Galpao Industrial Setor C',
    batch_code: 'L-013',
    fck_spec_mpa: 35,
    structure_name: null,
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: null,
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null
  },
  {
    id: 'sp-demo-5',
    specimen_code: 'L-016-1-28D',
    status: 'MOLDED',
    test_age_days: 28,
    due_date: isoOffset(1),
    specimen_diameter_mm: 100,
    specimen_height_mm: 200,
    weight_kg: 3.88,
    height_diameter_ratio: 2.0,
    correction_factor: 1.0,
    project_id: 'proj-demo-1',
    batch_id: 'b-demo-1',
    project_name: 'Edificio Aurora — Pilotis L3',
    batch_code: 'L-016',
    fck_spec_mpa: 30,
    structure_name: null,
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: null,
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null
  }
]
