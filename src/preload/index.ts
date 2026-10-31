import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type ConductorApi,
  type HistoryItem,
  type SessionUpdate,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type UsageSnapshot
} from '../shared/ipc'

// Única ponte entre o renderer e o sistema. Expor apenas funções específicas,
// nunca o ipcRenderer inteiro (D-008).

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: ConductorApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  terminal: {
    create: (request) => ipcRenderer.invoke(IPC.terminalCreate, request),
    write: (terminalId, data) => ipcRenderer.send(IPC.terminalWrite, terminalId, data),
    resize: (terminalId, cols, rows) => ipcRenderer.send(IPC.terminalResize, terminalId, cols, rows),
    kill: (terminalId) => ipcRenderer.send(IPC.terminalKill, terminalId),
    onData: (listener) => subscribe<TerminalDataEvent>(IPC.terminalData, listener),
    onExit: (listener) => subscribe<TerminalExitEvent>(IPC.terminalExit, listener)
  },
  history: {
    get: () => ipcRenderer.invoke(IPC.historyGet),
    onUpdate: (listener) => subscribe<HistoryItem[]>(IPC.historyUpdate, listener)
  },
  onSessionUpdate: (listener) => subscribe<SessionUpdate>(IPC.sessionUpdate, listener),
  usage: {
    get: () => ipcRenderer.invoke(IPC.usageGet),
    onUpdate: (listener) => subscribe<UsageSnapshot>(IPC.usageUpdate, listener)
  },
  pickDirectory: (defaultPath) => ipcRenderer.invoke(IPC.dialogPickDirectory, defaultPath),
  onCloseRequested: (listener) => subscribe<void>(IPC.appCloseRequested, listener),
  confirmClose: () => ipcRenderer.send(IPC.appConfirmClose)
}

contextBridge.exposeInMainWorld('conductor', api)
