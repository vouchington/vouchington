import { readFileSync } from 'node:fs'

import type ts from 'typescript'

import { normalizePath } from './program-paths.mts'

export function backendApiRouteRootFileNames(
  fileNames: readonly string[],
  hasRouteCall: (fileName: string, sourceText: string) => boolean,
): string[] {
  return fileNames.filter(fileName => {
    const normalized = normalizePath(fileName)
    return (
      normalized.endsWith('.d.ts') ||
      normalized.endsWith('.d.mts') ||
      normalized.endsWith('.d.cts') ||
      (normalized.includes('/backend/api/v1/') &&
        normalized.endsWith('.mts') &&
        !normalized.endsWith('.test.mts') &&
        !normalized.includes('/__tests__/')) ||
      isOutsideV1RouteRoot(fileName, normalized, hasRouteCall)
    )
  })
}

function isOutsideV1RouteRoot(
  fileName: string,
  normalized: string,
  hasRouteCall: (fileName: string, sourceText: string) => boolean,
): boolean {
  if (
    !normalized.includes('/backend/api/') ||
    normalized.includes('/backend/api/v1/') ||
    !normalized.endsWith('.mts') ||
    normalized.endsWith('.test.mts') ||
    normalized.includes('/__tests__/')
  ) {
    return false
  }
  const text = readFileSync(fileName, 'utf8')
  if (!/\.route\s*\(/u.test(text)) return false
  return hasRouteCall(fileName, text)
}

export function backendApiSourceFiles(
  program: ts.Program,
  hasRouteRegistration: (source: ts.SourceFile) => boolean,
): { registeredRouteFiles: ts.SourceFile[]; apiSourceFiles: ts.SourceFile[] } {
  const sources = program.getSourceFiles()
  const registeredRouteFiles = sources.filter(file => {
    const path = normalizePath(file.fileName)
    return path.includes('/backend/api/') && hasRouteRegistration(file)
  })
  const externalRouteDirectories = new Set<string>()
  for (const file of registeredRouteFiles) {
    const path = normalizePath(file.fileName)
    if (path.includes('/backend/api/v1/')) continue
    externalRouteDirectories.add(path.slice(0, path.lastIndexOf('/')))
  }
  const apiSourceFiles = sources.filter(file => {
    const path = normalizePath(file.fileName)
    return (
      path.includes('/backend/api/') &&
      (path.includes('/backend/api/v1/') ||
        [...externalRouteDirectories].some(directory => path.startsWith(`${directory}/`))) &&
      !path.endsWith('.test.mts') &&
      !path.includes('/__tests__/')
    )
  })
  return { registeredRouteFiles, apiSourceFiles }
}
