import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import {
  createCompilerProgramCache,
  trackCompilerHost,
  type CompilerHostProbeSnapshot,
  type CompilerProgramGeneration,
} from 'vouchington-tooling/compiler-build'

import { normalizePath } from './program-paths.mts'
import { backendApiRouteRootFileNames } from './route-file-roots.mts'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const maximumBuildAttempts = 3
const programCache = createCompilerProgramCache({
  ts,
  configPath: resolve(repoRoot, 'backend/tsconfig.json'),
  rootNames: configuration => backendApiRouteRootFileNames(configuration.fileNames),
  maximumAttempts: maximumBuildAttempts,
})

export type BackendProgramGeneration = CompilerProgramGeneration
export type BackendProgram = {
  generation: BackendProgramGeneration
  program: ts.Program
  routeFiles: ts.SourceFile[]
}

/** Loads the shared program while its selected roots and compiler inputs remain fresh. */
export function loadBackendProgram(): BackendProgram {
  let snapshot
  try {
    snapshot = programCache.load()
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === `Inputs changed during ${maximumBuildAttempts} consecutive build attempts`
    ) {
      throw new Error(
        `Backend TypeScript inputs changed during ${maximumBuildAttempts} consecutive program builds`,
        { cause: err },
      )
    }
    throw err
  }
  return {
    generation: snapshot.generation,
    program: snapshot.program,
    routeFiles: snapshot.program
      .getSourceFiles()
      .filter(file => normalizePath(file.fileName).includes('/backend/api/v1/')),
  }
}

/** Number of program builds performed by this process, excluding warm cache hits. */
export function getBackendProgramBuildCount(): number {
  return programCache.buildCount
}

export function createTrackedBackendProgramForTest(
  rootNames: string[],
  options: ts.CompilerOptions,
  hooks?: { afterRead?(path: string): boolean | void },
): { probeSnapshot: CompilerHostProbeSnapshot; program: ts.Program } {
  const tracker = createBackendProgramCompilerHost(options, hooks)
  const program = ts.createProgram({ host: tracker.host, options, rootNames })
  return { probeSnapshot: tracker.snapshot(), program }
}

export function createBackendProgramCompilerHost(
  options: ts.CompilerOptions,
  hooks?: { afterRead?(path: string): boolean | void },
): { host: ts.CompilerHost; snapshot(): CompilerHostProbeSnapshot } {
  return trackCompilerHost(ts.createCompilerHost(options, true), {
    ...hooks,
    readFileReplay: 'when-filesystem-metadata-stable',
  })
}
