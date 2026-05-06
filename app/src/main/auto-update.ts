// Auto-update via electron-updater + GitHub Releases.
// Em dev (não empacotado) o updater é desabilitado pra evitar erros de
// app-update.yml ausente.

import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../shared/ipc'
import type { UpdateState } from '../shared/types'

let currentState: UpdateState = {
  phase: 'idle',
  current_version: app.getVersion()
}

function broadcast(window: BrowserWindow | null) {
  window?.webContents.send(IPC.UPDATE_STATE, currentState)
}

function setState(partial: Partial<UpdateState>, window: BrowserWindow | null) {
  currentState = { ...currentState, ...partial }
  broadcast(window)
}

export function getUpdateState(): UpdateState {
  return currentState
}

export function setupAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    currentState = { phase: 'disabled', current_version: app.getVersion() }
    return
  }

  // Mantém UX sob nosso controle: baixa automaticamente, mas instala só
  // quando o usuário clicar (ou ao fechar o app, como fallback).
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setState({ phase: 'checking', error: undefined }, getWindow())
  })

  autoUpdater.on('update-available', (info) => {
    setState(
      {
        phase: 'available',
        remote_version: info.version,
        downloaded_bytes: 0,
        total_bytes: undefined,
        error: undefined
      },
      getWindow()
    )
  })

  autoUpdater.on('update-not-available', () => {
    setState({ phase: 'idle', error: undefined }, getWindow())
  })

  autoUpdater.on('download-progress', (progress) => {
    setState(
      {
        phase: 'available',
        downloaded_bytes: progress.transferred,
        total_bytes: progress.total
      },
      getWindow()
    )
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState(
      { phase: 'ready', remote_version: info.version, error: undefined },
      getWindow()
    )
  })

  autoUpdater.on('error', (err) => {
    setState(
      { phase: 'error', error: err.message ?? String(err) },
      getWindow()
    )
  })
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    // Erros já são capturados pelo evento 'error', mas evita unhandled rejection.
    console.error('[auto-update] check failed:', err)
  }
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return
  // isSilent=false (mostra o instalador), isForceRunAfter=true (reabre app)
  autoUpdater.quitAndInstall(false, true)
}
