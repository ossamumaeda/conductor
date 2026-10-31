import { defineConfig } from 'electron-vite'

// Entradas padrão do electron-vite:
//   main     → src/main/index.ts
//   preload  → src/preload/index.ts
//   renderer → src/renderer/index.html
export default defineConfig({
  main: {},
  preload: {},
  renderer: {}
})
