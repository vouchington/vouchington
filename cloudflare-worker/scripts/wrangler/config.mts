import type { WranglerRuntimePaths } from './runtime.mts'

export interface BuildWranglerArgsOptions {
  certPath: string
  hasCerts: boolean
  inspectorPort: string
  isCi: boolean
  keyPath: string
  logLevelOverride?: string
  persistTo: string
  workerPort: string
}

export interface WranglerEventOptions {
  attempt: number
  event: string
  hasCerts: boolean
  inspectorPort: string
  isCi: boolean
  logLevel: string
  persistTo?: string
  timestamp: string
  workerPort: string
  workerdVersion: string
  wranglerVersion: string
}

export interface WranglerEvent extends WranglerEventOptions {
  code?: number | null
  elapsedMs?: number
  message?: string
  readyMs?: number
  signal?: string | null
  uptimeMs?: number
}

export type WranglerEventExtra = Omit<WranglerEvent, keyof WranglerEventOptions>

export interface WranglerStderrConsoleFilterState {
  bufferedLine: string
  suppressNextWorkerdStackLine: boolean
}

export interface StaleWranglerCacheOptions {
  isCi: boolean
  persistTo?: string
  runtimePaths?: WranglerRuntimePaths
  workerDir: string
}

const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  'g',
)
const WORKERD_BROKEN_PIPE_RE =
  /kj::getCaughtExceptionAsKj\(\).*::write\(fd, buffer\.begin\(\), buffer\.size\(\)\): Broken pipe/
const WORKERD_STACK_RE = /^\s*stack:\s+\S*workerd\S*/

export function getStaleWranglerCachePaths(options: StaleWranglerCacheOptions): string[] {
  const paths: string[] = []

  if (options.runtimePaths !== undefined) {
    paths.push(options.runtimePaths.root)
  }

  if (options.isCi) {
    if (options.runtimePaths === undefined && options.persistTo !== undefined) {
      paths.push(options.persistTo)
    }
    return [...new Set(paths)]
  }

  paths.push(`${options.workerDir}/.wrangler/state`)
  return [...new Set(paths)]
}

export function getWranglerLogLevel(isCi: boolean, override?: string): string {
  return override?.trim() || (isCi ? 'error' : 'none')
}

// In CI, pass port 0 so the OS assigns the inspector port atomically, closing the TOCTOU gap
// between pre-allocation and bind() (option 4 from #5365; makes the option-3 retry fallback moot).
export function resolveEffectiveInspectorPort(isCi: boolean, configuredPort: string): string {
  return isCi ? '0' : configuredPort
}

export function buildWranglerArgs(options: BuildWranglerArgsOptions): {
  args: string[]
  logLevel: string
  persistTo: string
} {
  const args: string[] = ['dev', 'dist/index.js', '--no-bundle', '--config', 'wrangler.local.jsonc']

  args.push(
    '--local',
    '--port',
    options.workerPort,
    '--inspector-port',
    resolveEffectiveInspectorPort(options.isCi, options.inspectorPort),
    '--ip',
    '0.0.0.0',
  )

  if (options.hasCerts) {
    args.push(
      '--local-protocol',
      'https',
      '--https-cert-path',
      options.certPath,
      '--https-key-path',
      options.keyPath,
    )
  }

  const logLevel = getWranglerLogLevel(options.isCi, options.logLevelOverride)
  const persistTo = options.persistTo
  args.push('--persist-to', persistTo)
  args.push(`--log-level=${logLevel}`)

  return { args, logLevel, persistTo }
}

export const WRANGLER_READY_RE = /\bReady on\b/i

export function isWranglerReadyText(text: string): boolean {
  return WRANGLER_READY_RE.test(text)
}

export function appendWranglerReadySearchText(
  previousText: string,
  text: string,
): {
  isReady: boolean
  searchText: string
} {
  const combinedText = `${previousText}${text}`
  return {
    isReady: WRANGLER_READY_RE.test(combinedText),
    searchText: combinedText.slice(-4096),
  }
}

export function createWranglerEvent(
  options: WranglerEventOptions,
  extra: WranglerEventExtra = {},
): WranglerEvent {
  return { ...options, ...extra }
}

export function createWranglerStderrConsoleFilterState(): WranglerStderrConsoleFilterState {
  return {
    bufferedLine: '',
    suppressNextWorkerdStackLine: false,
  }
}

export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_ESCAPE_RE, '')
}

export function filterWranglerStderrConsoleLines(
  state: WranglerStderrConsoleFilterState,
  text: string,
  options: { flush?: boolean } = {},
): string[] {
  const combinedText = `${state.bufferedLine}${text}`
  const lines = combinedText.split(/\r?\n/)
  const endsWithLineBreak = /\r?\n$/.test(combinedText)

  if (!endsWithLineBreak && !options.flush) {
    state.bufferedLine = lines.pop() ?? ''
  } else {
    state.bufferedLine = ''
  }

  const visibleLines: string[] = []
  for (const line of lines) {
    const strippedLine = stripAnsi(line)
    if (!strippedLine.trim()) continue

    if (WORKERD_BROKEN_PIPE_RE.test(strippedLine)) {
      state.suppressNextWorkerdStackLine = true
      continue
    }

    if (state.suppressNextWorkerdStackLine && WORKERD_STACK_RE.test(strippedLine)) {
      state.suppressNextWorkerdStackLine = false
      continue
    }

    state.suppressNextWorkerdStackLine = false
    visibleLines.push(line)
  }

  if (options.flush) {
    state.suppressNextWorkerdStackLine = false
  }

  return visibleLines
}
