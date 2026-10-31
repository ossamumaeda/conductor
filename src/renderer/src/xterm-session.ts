// Uma instância de xterm.js ligada a um pty no main (D-003).
// Trocar de terminal só esconde a instância: o scrollback e o processo continuam vivos.

import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@fontsource/noto-sans-symbols-2/400.css'
import '@xterm/xterm/css/xterm.css'

// Noto Sans Symbols 2 cobre símbolos que a TUI usa e o DM Mono não tem (ex.: ⏵⏵ do "auto mode").
const FONT_FAMILY = '"DM Mono", "Noto Sans Symbols 2", "DejaVu Sans Mono", monospace'
const FONT_SIZE = 13

// Paleta derivada do mockup. A TUI do Claude usa mais truecolor do que as 16 cores ANSI.
const THEME: ITheme = {
  background: '#0b0e12',
  foreground: '#d0d6dd',
  cursor: '#a6e2a9',
  cursorAccent: '#0b0e12',
  selectionBackground: '#2c4034',
  selectionInactiveBackground: '#232c27',
  black: '#1b2027', brightBlack: '#5d6773',
  red: '#ed8a8a', brightRed: '#ffa3a3',
  green: '#8bd497', brightGreen: '#a6e2a9',
  yellow: '#e8c278', brightYellow: '#f3d58f',
  blue: '#7fb4ff', brightBlue: '#9cc6ff',
  magenta: '#c79bf2', brightMagenta: '#d8b4fa',
  cyan: '#7fd4d4', brightCyan: '#9ee6e6',
  white: '#d0d6dd', brightWhite: '#eef1f4'
}

let fontsReady: Promise<unknown> | null = null

/** O xterm mede a célula na abertura: a fonte precisa estar carregada antes. */
export function loadTerminalFonts(): Promise<unknown> {
  fontsReady ??= Promise.all([
    document.fonts.load(`400 ${FONT_SIZE}px "DM Mono"`),
    document.fonts.load(`500 ${FONT_SIZE}px "DM Mono"`),
    // Fontes com unicode-range só baixam sob demanda; o canvas do xterm não dispara isso.
    document.fonts.load(`400 ${FONT_SIZE}px "Noto Sans Symbols 2"`, '⏵⏺✻')
  ])
  return fontsReady
}

export interface PtyBridge {
  write(data: string): void
  resize(cols: number, rows: number): void
}

export class XtermSession {
  readonly host: HTMLDivElement
  private readonly term: Terminal
  private readonly fit = new FitAddon()
  private bridge: PtyBridge | null = null
  private readonly observer: ResizeObserver
  private fitFrame = 0

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div')
    this.host.className = 'xterm-host'
    parent.append(this.host)

    this.term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE,
      fontWeight: '400',
      fontWeightBold: '500',
      lineHeight: 1.2,
      theme: THEME,
      cursorBlink: true,
      allowProposedApi: false,
      scrollback: 10_000,
      macOptionIsMeta: true
    })
    this.term.loadAddon(this.fit)
    this.term.open(this.host)

    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      this.term.loadAddon(webgl)
    } catch {
      // Sem WebGL: o xterm segue com o renderer DOM padrão.
    }

    this.term.attachCustomKeyEventHandler((event) => this.handleKey(event))
    this.term.onData((data) => this.bridge?.write(data))
    this.term.onResize(({ cols, rows }) => this.bridge?.resize(cols, rows))

    this.observer = new ResizeObserver(() => this.scheduleFit())
    this.observer.observe(this.host)
    this.fitNow()
  }

  /**
   * Atalhos de cópia no padrão dos terminais Linux. Não interceptamos Ctrl+C
   * (interromper) nem Ctrl+V (o Claude usa para colar imagens): eles vão para o pty.
   */
  private handleKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true
    const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
    if (!ctrlShift) return true

    if (event.code === 'KeyC') {
      event.preventDefault()
      const selection = this.term.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
      return false
    }
    if (event.code === 'KeyV') {
      // preventDefault evita o "colar sem formatação" nativo do Chromium, que colaria duas vezes.
      event.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        if (text) this.term.paste(text)
      })
      return false
    }
    return true
  }

  /** Colunas e linhas que cabem no espaço atual. */
  measure(): { cols: number; rows: number } {
    const dims = this.fit.proposeDimensions()
    const valid = (n: number | undefined): n is number => Number.isInteger(n) && (n as number) >= 2
    return { cols: valid(dims?.cols) ? dims.cols : 80, rows: valid(dims?.rows) ? dims.rows : 24 }
  }

  bind(bridge: PtyBridge): void {
    this.bridge = bridge
    const { cols, rows } = this.term
    bridge.resize(cols, rows)
  }

  write(data: string): void {
    this.term.write(data)
  }

  writeNotice(text: string): void {
    this.term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`)
  }

  show(): void {
    this.host.hidden = false
    this.fitNow()
    this.term.focus()
  }

  hide(): void {
    this.host.hidden = true
  }

  private scheduleFit(): void {
    cancelAnimationFrame(this.fitFrame)
    this.fitFrame = requestAnimationFrame(() => this.fitNow())
  }

  private fitNow(): void {
    // Escondido, o host mede 0×0 e o fit encolheria o terminal à toa.
    if (this.host.hidden || this.host.clientWidth === 0) return
    try {
      this.fit.fit()
    } catch {
      // Ignora medições durante a montagem do layout.
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.fitFrame)
    this.observer.disconnect()
    this.term.dispose()
    this.host.remove()
  }
}
