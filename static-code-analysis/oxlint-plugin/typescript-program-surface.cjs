'use strict'

const FACTORIES = new Set([
  'createCompilerHost',
  'createIncrementalCompilerHost',
  'createSolutionBuilderHost',
  'createSolutionBuilderWithWatchHost',
  'createWatchCompilerHost',
  'createAbstractBuilder',
  'createBuilderProgram',
  'createBuilderProgramUsingIncrementalBuildInfo',
  'createEmitAndSemanticDiagnosticsBuilderProgram',
  'createIncrementalProgram',
  'createLanguageService',
  'createProgram',
  'createRedirectedBuilderProgram',
  'createSemanticDiagnosticsBuilderProgram',
  'createSolutionBuilder',
  'createSolutionBuilderWithWatch',
  'createWatchProgram',
  'readBuilderProgram',
])
const MODULES = new Set(['typescript'])

function isProtectedFixtureFile(context) {
  const filename = context.filename.replaceAll('\\', '/')
  const cwd = context.cwd?.replaceAll('\\', '/').replace(/\/$/, '')
  const relativeFilename =
    cwd && filename.startsWith(`${cwd}/`) ? filename.slice(cwd.length + 1) : filename
  const ownerRoot = 'backend/test-helpers/api-fixtures'
  return (
    relativeFilename.startsWith(`${ownerRoot}/`) &&
    relativeFilename.endsWith('.mts') &&
    relativeFilename !== `${ownerRoot}/backend-program.mts`
  )
}

module.exports = { FACTORIES, MODULES, isProtectedFixtureFile }
