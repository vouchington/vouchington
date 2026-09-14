import type { EnCatalog } from '@ts-shared/ui-messages'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergeCatalogInPlace(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (isPlainObject(value)) {
      const existing = target[key]
      const nested = isPlainObject(existing) ? existing : {}
      if (nested !== existing) target[key] = nested
      mergeCatalogInPlace(nested, value)
      continue
    }
    target[key] = value
  }
}

export function cloneCatalog(incoming: EnCatalog): EnCatalog {
  const target: Record<string, unknown> = {}
  mergeCatalogInPlace(target, incoming as Record<string, unknown>)
  return target as EnCatalog
}
