export const BASIC_AUTH_SOURCE_FILE = 'cloudflare-worker/src/basic-auth.mts'
export const BASIC_AUTH_RUNBOOK_FILE = 'docs/operations/cloudflare-worker-staging-auth.md'

import {
  BASIC_AUTH_EXEMPT_METHODS_BY_PATH,
  BASIC_AUTH_EXEMPT_PATHS,
  findBasicAuthExemptMethodsByPath,
  findBasicAuthExemptPaths,
  findRunbookExemptRoutes,
} from './basic-auth-doc-sync-parsers.mts'

function formatPathList(paths: string[]): string {
  return paths.map(path => `\`${path}\``).join(', ')
}

function formatMethods(methods: string[]): string {
  return methods.map(method => `\`${method}\``).join(', ')
}

function sameMethods(left: string[], right: string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size !== rightSet.size) return false
  return Array.from(leftSet).every(method => rightSet.has(method))
}

function runtimeWouldMatchPath(path: string): boolean {
  return path === path.toLowerCase() && (path === '/' || !path.endsWith('/'))
}

export function checkBasicAuthRunbookExemptPathsSync(input: {
  sourceCode: string
  runbookMarkdown: string
}): string[] {
  const sourcePaths = findBasicAuthExemptPaths(input.sourceCode)
  const sourceMethodsByPath = findBasicAuthExemptMethodsByPath(input.sourceCode)
  const runbookRoutes = findRunbookExemptRoutes(input.runbookMarkdown)
  const errors: string[] = []

  if (!sourcePaths) {
    errors.push(
      `::error file=${BASIC_AUTH_SOURCE_FILE}::${BASIC_AUTH_SOURCE_FILE}: could not parse ${BASIC_AUTH_EXEMPT_PATHS} as new Set([...]) of string literals`,
    )
    return errors
  }
  if (!sourceMethodsByPath) {
    errors.push(
      `::error file=${BASIC_AUTH_SOURCE_FILE}::${BASIC_AUTH_SOURCE_FILE}: could not parse ${BASIC_AUTH_EXEMPT_METHODS_BY_PATH} as new Map([...]) of path/new Set([...]) method entries`,
    )
    return errors
  }

  const runtimeDeadPaths = sourcePaths.filter(path => !runtimeWouldMatchPath(path))
  if (runtimeDeadPaths.length > 0) {
    errors.push(
      `::error file=${BASIC_AUTH_SOURCE_FILE}::${BASIC_AUTH_SOURCE_FILE}: ${BASIC_AUTH_EXEMPT_PATHS} contains uppercase or trailing-slash path(s) the runtime would never match: ${formatPathList(runtimeDeadPaths)}`,
    )
    return errors
  }

  const sourcePathSet = new Set(sourcePaths)
  const methodMapPaths = Array.from(sourceMethodsByPath.keys())
  const missingFromMethodMap = sourcePaths.filter(path => !sourceMethodsByPath.has(path))
  const extraInMethodMap = methodMapPaths.filter(path => !sourcePathSet.has(path))
  if (missingFromMethodMap.length > 0 || extraInMethodMap.length > 0) {
    if (missingFromMethodMap.length > 0) {
      errors.push(
        `::error file=${BASIC_AUTH_SOURCE_FILE}::${BASIC_AUTH_SOURCE_FILE}: ${BASIC_AUTH_EXEMPT_METHODS_BY_PATH} is missing exempt path(s): ${formatPathList(missingFromMethodMap)}`,
      )
    }
    if (extraInMethodMap.length > 0) {
      errors.push(
        `::error file=${BASIC_AUTH_SOURCE_FILE}::${BASIC_AUTH_SOURCE_FILE}: ${BASIC_AUTH_EXEMPT_METHODS_BY_PATH} lists path(s) not present in ${BASIC_AUTH_EXEMPT_PATHS}: ${formatPathList(extraInMethodMap)}`,
      )
    }
    return errors
  }

  if (!runbookRoutes) {
    errors.push(
      `::error file=${BASIC_AUTH_RUNBOOK_FILE}::${BASIC_AUTH_RUNBOOK_FILE}: could not parse the Exempt paths Markdown table; table must contain Path and Methods columns with backticked values`,
    )
    return errors
  }

  const runbookPaths = runbookRoutes.map(route => route.path)
  const seenRunbookPaths = new Set<string>()
  const duplicateRunbookPaths = Array.from(
    new Set(runbookPaths.filter(path => seenRunbookPaths.has(path) || !seenRunbookPaths.add(path))),
  )
  if (duplicateRunbookPaths.length > 0) {
    errors.push(
      `::error file=${BASIC_AUTH_RUNBOOK_FILE}::${BASIC_AUTH_RUNBOOK_FILE}: basic-auth exempt path table repeats path(s): ${formatPathList(duplicateRunbookPaths)}`,
    )
    return errors
  }

  const runbookRoutesByPath = new Map(runbookRoutes.map(route => [route.path, route.methods]))
  const runbookSet = new Set(runbookPaths)
  const missingFromRunbook = sourcePaths.filter(path => !runbookSet.has(path))
  const extraInRunbook = runbookPaths.filter(path => !sourcePathSet.has(path))

  if (missingFromRunbook.length > 0) {
    errors.push(
      `::error file=${BASIC_AUTH_RUNBOOK_FILE}::${BASIC_AUTH_RUNBOOK_FILE}: basic-auth exempt path table is missing source path(s): ${formatPathList(missingFromRunbook)}`,
    )
  }
  if (extraInRunbook.length > 0) {
    errors.push(
      `::error file=${BASIC_AUTH_RUNBOOK_FILE}::${BASIC_AUTH_RUNBOOK_FILE}: basic-auth exempt path table lists path(s) not present in ${BASIC_AUTH_SOURCE_FILE}: ${formatPathList(extraInRunbook)}`,
    )
  }
  for (const path of sourcePaths) {
    const sourceMethods = sourceMethodsByPath.get(path)
    const runbookMethods = runbookRoutesByPath.get(path)
    if (sourceMethods && runbookMethods && !sameMethods(sourceMethods, runbookMethods)) {
      errors.push(
        `::error file=${BASIC_AUTH_RUNBOOK_FILE}::${BASIC_AUTH_RUNBOOK_FILE}: basic-auth exempt path table lists method(s) for \`${path}\` as ${formatMethods(runbookMethods)}, but ${BASIC_AUTH_SOURCE_FILE} has ${formatMethods(sourceMethods)}`,
      )
    }
  }

  return errors
}
