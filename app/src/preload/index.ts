// Bridge contextIsolation: expoe API segura pro renderer.
// Renderer NAO tem acesso direto a node/electron, apenas o que esta aqui.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { ElectronAPI } from '../shared/ipc'

const api: ElectronAPI = {
  press: {
    listPorts: () => ipcRenderer.invoke(IPC.PRESS_LIST_PORTS),
    connect: (port) => ipcRenderer.invoke(IPC.PRESS_CONNECT, port),
    disconnect: () => ipcRenderer.invoke(IPC.PRESS_DISCONNECT),
    getConfig: () => ipcRenderer.invoke(IPC.PRESS_GET_CONFIG),
    setConfig: (cfg) => ipcRenderer.invoke(IPC.PRESS_SET_CONFIG, cfg),
    startSession: () => ipcRenderer.invoke(IPC.PRESS_START_SESSION),
    stopSession: () => ipcRenderer.invoke(IPC.PRESS_STOP_SESSION),
    reset: () => ipcRenderer.invoke(IPC.PRESS_RESET),
    onReading: (cb) => {
      const handler = (_e: any, r: any) => cb(r)
      ipcRenderer.on(IPC.PRESS_READING, handler)
      return () => ipcRenderer.off(IPC.PRESS_READING, handler)
    },
    onState: (cb) => {
      const handler = (_e: any, s: any) => cb(s)
      ipcRenderer.on(IPC.PRESS_STATE, handler)
      return () => ipcRenderer.off(IPC.PRESS_STATE, handler)
    },
    onRupture: (cb) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.PRESS_RUPTURE, handler)
      return () => ipcRenderer.off(IPC.PRESS_RUPTURE, handler)
    }
  },
  app: {
    getConfig: () => ipcRenderer.invoke(IPC.APP_GET_CONFIG),
    setConfig: (cfg) => ipcRenderer.invoke(IPC.APP_SET_CONFIG, cfg)
  },
  calibration: {
    capture: (durationMs) => ipcRenderer.invoke(IPC.CALIBRATION_CAPTURE, durationMs),
    generatePdf: (calibration) => ipcRenderer.invoke(IPC.CALIBRATION_GENERATE_PDF, calibration)
  }
}

contextBridge.exposeInMainWorld('bstech', api)

declare global {
  interface Window {
    bstech: ElectronAPI
  }
}
