// Importações `?asset` do electron-vite: o arquivo é copiado para out/ e o import vira o caminho absoluto.
declare module '*?asset' {
  const path: string
  export default path
}
