import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { PressDriver } from './press-driver'
import { loadConfig, patchPress, patchApp } from './config-store'
import { generateCalibrationPdf } from './calibration-pdf'
import {
  setupAutoUpdate,
  checkForUpdates,
  quitAndInstall,
  getUpdateState
} from './auto-update'
import type { Calibration } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let press: PressDriver | null = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1280,
    minHeight: 760,
    show: false,
    title: 'BStech Prensa',
    backgroundColor: '#141414',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Carrega URL do dev server ou bundle de producao
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Abrir links externos no browser do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

async function setupPress() {
  const cfg = await loadConfig()
  // Em produção (empacotado) o default é modbus; quem instala o app tá com hardware.
  // Em dev sem env var, default é mock pra UI funcionar sem prensa.
  press = new PressDriver(cfg.press, {
    defaultMode: app.isPackaged ? 'modbus' : 'mock'
  })

  press.on('reading', (r) => mainWindow?.webContents.send(IPC.PRESS_READING, r))
  press.on('state', (s) => mainWindow?.webContents.send(IPC.PRESS_STATE, s))
  press.on('rupture', () => mainWindow?.webContents.send(IPC.PRESS_RUPTURE))
  press.on('error', (err) => console.error('[press]', err))
}

function registerIpc() {
  ipcMain.handle(IPC.PRESS_LIST_PORTS, async () => press?.listPorts() ?? [])
  ipcMain.handle(IPC.PRESS_CONNECT, async (_e, port: string) => {
    if (!press) return { ok: false, error: 'Driver nao inicializado' }
    return press.connect(port)
  })
  ipcMain.handle(IPC.PRESS_DISCONNECT, async () => press?.disconnect())
  ipcMain.handle(IPC.PRESS_GET_CONFIG, async () => press?.getConfig() ?? null)
  ipcMain.handle(IPC.PRESS_SET_CONFIG, async (_e, patch) => {
    const next = await patchPress(patch)
    press?.setConfig(patch)
    return next
  })
  ipcMain.handle(IPC.PRESS_START_SESSION, async () => press?.startSession() ?? { ok: false })
  ipcMain.handle(IPC.PRESS_STOP_SESSION, async () => press?.stopSession())
  ipcMain.handle(IPC.PRESS_RESET, async () => press?.reset())
  ipcMain.handle(IPC.PRESS_GET_STATE, async () => press?.getLiveState() ?? null)

  ipcMain.handle(IPC.APP_GET_CONFIG, async () => {
    const c = await loadConfig()
    return c.app
  })
  ipcMain.handle(IPC.APP_SET_CONFIG, async (_e, patch) => patchApp(patch))

  ipcMain.handle(IPC.CALIBRATION_CAPTURE, async (_e, durationMs?: number) => {
    if (!press) throw new Error('Driver nao inicializado')
    return press.captureSnapshot(durationMs ?? 2000)
  })
  ipcMain.handle(IPC.CALIBRATION_GENERATE_PDF, async (_e, calibration: Calibration) => {
    try {
      const pdfPath = await generateCalibrationPdf(calibration)
      return { ok: true, path: pdfPath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IPC.CALIBRATION_OPEN_PDF, async (_e, pdfPath: string) => {
    await shell.openPath(pdfPath)
  })

  ipcMain.handle(IPC.UPDATE_CHECK, async () => checkForUpdates())
  ipcMain.handle(IPC.UPDATE_INSTALL, async () => quitAndInstall())
  ipcMain.handle(IPC.UPDATE_GET_STATE, async () => getUpdateState())
}

// Garante uma única instância. Importante porque o NSIS auto-update precisa
// conseguir matar tudo antes de instalar. Se uma segunda janela abrir, joga foco
// na existente em vez de duplicar processo.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    await setupPress()
    registerIpc()
    await createWindow()
    setupAutoUpdate(() => mainWindow)
    // Checa update logo após boot (em prod). Em dev, vira no-op.
    void checkForUpdates()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Libera a serial port antes do app encerrar; sem isso, o instalador NSIS de
// uma versão nova pode reclamar que o processo ainda está rodando.
let isCleaningUp = false
app.on('before-quit', async (e) => {
  if (isCleaningUp) return
  if (!press) return
  isCleaningUp = true
  e.preventDefault()
  try {
    await press.disconnect()
  } catch (err) {
    console.error('[main] disconnect on quit failed:', err)
  }
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
