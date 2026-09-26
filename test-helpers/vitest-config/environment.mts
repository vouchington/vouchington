import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { runtimeCoverageConfigForScope } from './coverage-config.mts'
import { vitestCoverageScope } from './coverage-scope.mts'
export { coverageConfigForScope } from './coverage-config.mts'
if (!existsSync('.initialized') && !process.env.CI) {
  process.stderr.write(
    '\x1b[31mError: worktree not initialized.\x1b[0m .initialized was not found. Run ./dev/initialize monorepo (lint/unit tests) or ./dev/initialize web (full stack).\n',
  )
  process.exit(1)
}
process.env.NODE_ENV = 'test'
const nodeOptions = process.env.NODE_OPTIONS ?? ''
if (!nodeOptions.split(/\s+/).includes('--disable-warning=DEP0205')) {
  process.env.NODE_OPTIONS = `${nodeOptions} --disable-warning=DEP0205`.trim()
}
const originalEmitWarningKey = Symbol('originalEmitWarning')
const processWithOriginalEmitWarning = process as NodeJS.Process &
  Record<typeof originalEmitWarningKey, typeof process.emitWarning>
processWithOriginalEmitWarning[originalEmitWarningKey] = process.emitWarning
process.emitWarning = ((
  warning: string | Error,
  optionsOrType?: unknown,
  code?: string,
  ...args: unknown[]
) => {
  const warningCode =
    typeof optionsOrType === 'object' && optionsOrType !== null && 'code' in optionsOrType
      ? (optionsOrType as { code?: string }).code
      : code
  if (warningCode === 'DEP0205') return
  processWithOriginalEmitWarning[originalEmitWarningKey](
    warning,
    optionsOrType as never,
    code,
    ...(args as [Function?]),
  )
}) as typeof process.emitWarning
const defaultCiVitestWorkers = 2
const defaultVitestWorkers = process.env.CI ? defaultCiVitestWorkers : '30%'
export const maxCiVitestWorkers = 5
const coverageScope = vitestCoverageScope()
const isPortabilityCoverage = coverageScope === 'portability'
const isToolingCoverage = coverageScope === 'tooling'
const isWebStorybookBrowserCoverage = coverageScope === 'web-storybook-browser'
const isWebStorybookCoverage = coverageScope === 'web-storybook'
const isWebLibApiCoverage = coverageScope === 'web-lib-api'
const isChangedCoverage = coverageScope === 'changed'
export const coverageFlags = {
  isScopedCoverage:
    isToolingCoverage ||
    isPortabilityCoverage ||
    coverageScope === 'web' ||
    isWebStorybookCoverage ||
    isWebStorybookBrowserCoverage ||
    isWebLibApiCoverage ||
    isChangedCoverage,
  isToolingCoverage,
  isWebLibApiCoverage,
  isWebStorybookBrowserCoverage,
  isWebStorybookCoverage,
  isChangedCoverage,
}
if (coverageScope && !coverageFlags.isScopedCoverage) {
  process.stderr.write(
    `Unknown VITEST_COVERAGE_SCOPE value "${coverageScope}". Using default coverage scope.\n`,
  )
}
export const isStorybookBrowserEnabled = process.env.VITEST_STORYBOOK_BROWSER === '1'
export const parseWorkerCount = (
  name: string,
  value: string | undefined,
  fallback: number | string,
  silent = false,
): number | string => {
  if (!value) return fallback
  if (/^[1-9]\d*%$/.test(value)) return value
  if (/^[1-9]\d*$/.test(value)) return Number(value)
  if (!silent) {
    process.stderr.write(
      `Invalid ${name} value "${value}". Falling back to default: ${fallback}.\n`,
    )
  }
  return fallback
}
const parseCiVitestMaxWorkers = (value: string | undefined): number => {
  const workerCount = parseWorkerCount('VITEST_MAX_WORKERS', value, defaultCiVitestWorkers)
  if (typeof workerCount === 'number') {
    const cappedWorkerCount = Math.min(workerCount, maxCiVitestWorkers)
    process.env.VITEST_MAX_WORKERS = String(cappedWorkerCount)
    return cappedWorkerCount
  }

  process.stderr.write(
    `Invalid CI VITEST_MAX_WORKERS value "${value}". Falling back to default: ${defaultCiVitestWorkers}.\n`,
  )
  process.env.VITEST_MAX_WORKERS = String(defaultCiVitestWorkers)
  return defaultCiVitestWorkers
}

export const parseVitestMaxWorkers = (value: string | undefined): number | string =>
  process.env.CI
    ? parseCiVitestMaxWorkers(value)
    : parseWorkerCount('VITEST_MAX_WORKERS', value, defaultVitestWorkers)

export const parseStorybookBrowserMaxWorkers = (): number | string => {
  if (process.env.VITEST_STORYBOOK_BROWSER_MAX_WORKERS != null) {
    return parseWorkerCount(
      'VITEST_STORYBOOK_BROWSER_MAX_WORKERS',
      process.env.VITEST_STORYBOOK_BROWSER_MAX_WORKERS,
      1,
    )
  }
  return parseWorkerCount('VITEST_MAX_WORKERS', process.env.VITEST_MAX_WORKERS, 1, true)
}
export const parseStorybookBrowserConnectTimeout = (): number => {
  const value = process.env.STORYBOOK_BROWSER_HANG_MS
  if (!value) return 120_000
  const timeout = Number(value)
  if (Number.isSafeInteger(timeout) && timeout > 0) return timeout
  process.stderr.write(
    `Invalid STORYBOOK_BROWSER_HANG_MS value "${value}". Falling back to browser connection timeout: 120000.\n`,
  )
  return 120_000
}
export const storybookBrowserConnectionTimeoutMs = parseStorybookBrowserConnectTimeout()
export const parseStorybookBrowserApiPort = (): number | undefined => {
  if (process.env.VITEST_STORYBOOK_BROWSER_API_PORT) {
    const configuredPort = Number(process.env.VITEST_STORYBOOK_BROWSER_API_PORT)
    if (Number.isSafeInteger(configuredPort) && configuredPort > 0) return configuredPort
    process.stderr.write(
      `Invalid VITEST_STORYBOOK_BROWSER_API_PORT value "${process.env.VITEST_STORYBOOK_BROWSER_API_PORT}". Leaving browser API port unset.\n`,
    )
  }
  return undefined
}
export const vitestViteCacheDir = resolve(process.cwd(), '.cache/vite/vitest')
export const vitestFsModuleCachePath = resolve(process.cwd(), '.cache/vite/fs-module')
export const storybookBrowserCacheDir =
  process.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR ??
  (process.env.CI
    ? resolve(process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(), 'vite-storybook-browser')
    : resolve(process.cwd(), 'node_modules/.vite/storybook-browser'))

export const storybookPreviewApiPath = isStorybookBrowserEnabled
  ? createRequire(resolve(process.cwd(), 'web/package.json')).resolve(
      'storybook/internal/preview-api',
    )
  : resolve(process.cwd(), 'web/node_modules/storybook/dist/preview-api/index.js')
const hasCoverageCliFlag = process.argv.some(
  argument => argument === '--coverage' || argument === '--coverage=true',
)

// CI supplies this explicitly from each reusable workflow's publish_coverage input. Keep an
// explicit CLI flag authoritative so local `vitest --coverage` remains an opt-in regardless of
// the ambient environment.
export const isVitestCoverageEnabled =
  hasCoverageCliFlag || process.env.VITEST_COVERAGE_ENABLED === 'true'

export const coverageConfig = () => ({
  ...runtimeCoverageConfigForScope(coverageScope),
  enabled: isVitestCoverageEnabled,
})
