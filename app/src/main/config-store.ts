// Persistencia simples de config em JSON no userData.
// Substitui electron-store pra evitar depender de mais um pacote nativo.

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { PressConfig } from '../shared/types'

const DEFAULT_PRESS_CONFIG: PressConfig = {
  port: 'COM3',
  baud_rate: 9600,
  modbus_address: 1,
  register: 0,
  poll_interval_ms: 100,
  rupture_drop_threshold_kgf: 800,
  // Novus N1500-LC com DECP=2: cada unidade raw = 10 kgf (display em ton com 2 casas).
  // Ajuste se a configuração de casas decimais do indicador mudar.
  value_scale: 10
}

interface AppConfig {
  supabase_url: string
  supabase_anon_key: string
  client_id: string
}

const DEFAULT_APP_CONFIG: AppConfig = {
  supabase_url: 'https://xbybwkfmbsknwlwuohbj.supabase.co',
  supabase_anon_key:
    '<REDACTED_BSTECH_ANON_KEY>',
  client_id: 'd8f8e8e5-974f-4bd1-b658-2621e50b2021' // BS Tech (sandbox)
}

interface FullConfig {
  press: PressConfig
  app: AppConfig
}

const DEFAULT_CONFIG: FullConfig = {
  press: DEFAULT_PRESS_CONFIG,
  app: DEFAULT_APP_CONFIG
}

let cached: FullConfig | null = null

function configPath() {
  return join(app.getPath('userData'), 'bstech-prensa-config.json')
}

export async function loadConfig(): Promise<FullConfig> {
  if (cached) return cached
  try {
    const raw = await fs.readFile(configPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    cached = {
      press: { ...DEFAULT_PRESS_CONFIG, ...(parsed.press ?? {}) },
      app: { ...DEFAULT_APP_CONFIG, ...(parsed.app ?? {}) }
    }
  } catch {
    cached = DEFAULT_CONFIG
    await saveConfig(cached)
  }
  return cached
}

export async function saveConfig(cfg: FullConfig) {
  cached = cfg
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2), 'utf-8')
}

export async function patchPress(patch: Partial<PressConfig>) {
  const cur = await loadConfig()
  const next = { ...cur, press: { ...cur.press, ...patch } }
  await saveConfig(next)
  return next.press
}

export async function patchApp(patch: Partial<AppConfig>) {
  const cur = await loadConfig()
  const next = { ...cur, app: { ...cur.app, ...patch } }
  await saveConfig(next)
  return next.app
}
