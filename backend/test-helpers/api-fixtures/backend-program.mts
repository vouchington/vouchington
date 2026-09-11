import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import {
  backendProgramProbesAreFresh,
  trackBackendProgramCompilerHost,
  type BackendProgramProbeSnapshot,
} from './backend-program-freshness.mts'
import { settleBackendProgramBuild } from './backend-program-settlement.mts'
import { formatDiagnostics, normalizePath } from './response-contract-registration.mts'
import { backendApiRouteRootFileNames } from './route-file-roots.mts'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
declare const backendProgramGenerationBrand: unique symbol
export type BackendProgramGeneration = {
  readonly [backendProgramGenerationBrand]: true
}
export type BackendProgram = {
  generation: BackendProgramGeneration
  program: ts.Program
  routeFiles: ts.SourceFile[]
}

type CachedBackendProgram = BackendProgram & {
  probeSnapshot: BackendProgramProbeSnapshot
  rootSignature: string
}

let cachedProgram: CachedBackendProgram | undefined
let buildCount = 0
let entryCount = 0
let simulateInputChange = false
let simulateBuildTimeInputChange = false

/**
 * Memoizes the single `ts.Program` shared by every backend contract loader while its complete
 * compiler input set is unchanged. The tracked CompilerHost records every filesystem decision
 * TypeScript makes, including module-resolution package metadata and failed lookups. Warm calls
 * replay that exact graph; a changed probe or root set rebuilds and advances the opaque generation.
 */
export function loadBackendProgram(): BackendProgram {
  entryCount += 1
  const configuration = readBackendProgramConfiguration()
  if (cachedProgram && !simulateInputChange) {
    if (
      cachedProgram.rootSignature === configuration.rootSignature &&
      backendProgramProbesAreFresh(cachedProgram.probeSnapshot)
    ) {
      return cachedProgram
    }
  }
  simulateInputChange = false
  return buildBackendProgram(configuration)
}

function buildBackendProgram(configuration: BackendProgramConfiguration): CachedBackendProgram {
  // Release the previous generation before building the next: nothing below reads `cachedProgram`
  // during the build, and holding it reachable here would keep its ~870 MB retained heap live for the
  // entire ~1.4 GB transient build, nearly doubling peak memory in a forked-worker heap for no reason.
  cachedProgram = undefined
  const settled = settleBackendProgramBuild(configuration, {
    buildAttempt(currentConfiguration) {
      const { probeSnapshot, program } = createTrackedBackendProgramForTest(
        currentConfiguration.rootFileNames,
        currentConfiguration.parsed.options,
        simulateBuildTimeInputChange
          ? { afterRead: consumeBuildTimeInputChangeForTest }
          : undefined,
      )
      buildCount += 1
      return { configuration: currentConfiguration, probeSnapshot, program }
    },
    confirmAttempt(currentConfiguration, { probeSnapshot }) {
      const confirmedConfiguration = readBackendProgramConfiguration()
      return {
        configuration: confirmedConfiguration,
        settled:
          currentConfiguration.rootSignature === confirmedConfiguration.rootSignature &&
          backendProgramProbesAreFresh(probeSnapshot),
      }
    },
  })
  const routeFiles = settled.program
    .getSourceFiles()
    .filter(file => normalizePath(file.fileName).includes('/backend/api/v1/'))
  cachedProgram = {
    generation: Object.freeze({}) as BackendProgramGeneration,
    probeSnapshot: settled.probeSnapshot,
    program: settled.program,
    rootSignature: settled.configuration.rootSignature,
    routeFiles,
  }
  return cachedProgram
}

type BackendProgramConfiguration = {
  parsed: ts.ParsedCommandLine
  rootFileNames: string[]
  rootSignature: string
}

function readBackendProgramConfiguration(): BackendProgramConfiguration {
  const configPath = resolve(repoRoot, 'backend/tsconfig.json')
  const config = ts.readConfigFile(configPath, path => readFileSync(path, 'utf8'))
  if (config.error) throw new Error(formatDiagnostics([config.error]))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(repoRoot, 'backend'))
  if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors))
  const rootFileNames = backendApiRouteRootFileNames(parsed.fileNames)
  const rootSignature = JSON.stringify({
    config: config.config,
    options: parsed.options,
    projectReferences: parsed.projectReferences?.map(reference => reference.path),
    rootFileNames: rootFileNames.toSorted(),
  })
  return { parsed, rootFileNames, rootSignature }
}

/**
 * Number of times loadBackendProgram() has actually built a `ts.Program` (cache misses only,
 * never cache hits) since the last narrow test reset. See backend-program.test.mts.
 */
export function getBackendProgramBuildCount(): number {
  return buildCount
}

/**
 * Number of times loadBackendProgram() has been called at all, including cache hits. Unlike
 * getBackendProgramBuildCount(), this also catches a reintroduced call that hits an already-warm
 * cache — a build-count-only assertion would miss that call silently.
 */
export function getBackendProgramEntryCount(): number {
  return entryCount
}

export function createTrackedBackendProgramForTest(
  rootNames: string[],
  options: ts.CompilerOptions,
  hooks?: { afterRead?(path: string): boolean | void },
): { probeSnapshot: BackendProgramProbeSnapshot; program: ts.Program } {
  const tracker = createBackendProgramCompilerHost(options, hooks)
  const program = ts.createProgram({ host: tracker.host, options, rootNames })
  return { probeSnapshot: tracker.snapshot(), program }
}

export function createBackendProgramCompilerHost(
  options: ts.CompilerOptions,
  hooks?: { afterRead?(path: string): boolean | void },
): { host: ts.CompilerHost; snapshot(): BackendProgramProbeSnapshot } {
  return trackBackendProgramCompilerHost(ts.createCompilerHost(options, true), {
    ...hooks,
    readFileReplay: 'when-filesystem-metadata-stable',
  })
}

export function resetBackendProgramCacheForTest(): void {
  cachedProgram = undefined
  buildCount = 0
  entryCount = 0
  simulateInputChange = false
  simulateBuildTimeInputChange = false
}

export function simulateBackendProgramInputChangeForTest(): void {
  simulateInputChange = true
}

export function simulateBackendProgramBuildTimeInputChangeForTest(): void {
  simulateBuildTimeInputChange = true
}

function consumeBuildTimeInputChangeForTest(): boolean {
  if (!simulateBuildTimeInputChange) return false
  simulateBuildTimeInputChange = false
  return true
}
