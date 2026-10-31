import type { ConductorApi } from '../../shared/ipc'

declare global {
  interface Window {
    conductor: ConductorApi
  }
}
