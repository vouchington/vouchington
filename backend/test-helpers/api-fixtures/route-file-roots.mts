import { normalizePath } from './response-contract-registration.mts'

export function backendApiRouteRootFileNames(fileNames: readonly string[]): string[] {
  return fileNames.filter(fileName => {
    const normalized = normalizePath(fileName)
    return (
      normalized.endsWith('.d.ts') ||
      normalized.endsWith('.d.mts') ||
      normalized.endsWith('.d.cts') ||
      (normalized.includes('/backend/api/v1/') &&
        normalized.endsWith('.mts') &&
        !normalized.endsWith('.test.mts') &&
        !normalized.includes('/__tests__/'))
    )
  })
}
