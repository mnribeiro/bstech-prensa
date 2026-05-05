import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { PressDriver } from './press-driver'
import { loadConfig, patchPress, patchApp } from './config-store'
import { generateCalibrationPdf } from './calibration-pdf'
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
    backgroundColor: '#0a0e14',
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
  press = new PressDriver(cfg.press)

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
}

app.whenReady().then(async () => {
  await setupPress()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  if (press) await press.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
