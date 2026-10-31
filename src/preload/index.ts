import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ConductorApi } from '../shared/ipc'

// Única ponte entre o renderer e o sistema. Expor apenas funções específicas,
// nunca o ipcRenderer inteiro (D-008).
const api: ConductorApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('conductor', api)
