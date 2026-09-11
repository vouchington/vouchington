import type { SharedContext } from 'vouchington-tooling/shared-context'
import { INVENTORY_PATH, type ReaderInventory } from './post-publication-reader-inventory-types.mts'

export function validateRows(
  ctx: SharedContext,
  rows: unknown,
  label: string,
  errors: string[],
): boolean {
  if (!Array.isArray(rows)) {
    errors.push(`${INVENTORY_PATH}: ${label} must be an array`)
    return false
  }
  const paths = new Set<string>()
  let isValid = true
  for (const row of rows) {
    if (!isInventoryRow(row)) {
      errors.push(`${INVENTORY_PATH}: ${label} contains an invalid row`)
      isValid = false
      continue
    }
    if (
      label === 'classified_exceptions' &&
      (!row.reason || !row.owner_path || !row.owner_classification)
    ) {
      errors.push(`${INVENTORY_PATH}: classified_exceptions requires a reason and structured owner`)
    }
    if (paths.has(row.path)) errors.push(`${INVENTORY_PATH}: ${label} duplicates ${row.path}`)
    paths.add(row.path)
    const expectedClassification =
      label === 'implemented'
        ? [
            'direct-boundary',
            'direct-sql',
            'descendants-boundary',
            'mixed-discovery-sql',
            'public-boundary',
            'public-sql',
            'public-view',
            'story-posts-boundary',
            'viewer-discovery-sql',
          ]
        : label === 'pr2_baseline'
          ? ['public-reader']
          : ['mutation', 'private-reader', 'projection-owner', 'raw-hydrator', 'staff-reader']
    if (!expectedClassification.includes(row.classification)) {
      errors.push(`${INVENTORY_PATH}: ${label} has invalid classification ${row.classification}`)
    }
    if (!ctx.trackedFileSet.has(row.path)) {
      errors.push(`${INVENTORY_PATH}: ${label} references untracked path ${row.path}`)
    }
  }
  return isValid
}

export function isInventory(value: unknown): value is ReaderInventory {
  if (!value || typeof value !== 'object') return false
  const inventory = value as Record<string, unknown>
  return (
    Array.isArray(inventory.implemented) &&
    Array.isArray(inventory.pr2_baseline) &&
    Array.isArray(inventory.classified_exceptions)
  )
}

function isInventoryRow(value: unknown): value is {
  path: string
  classification: string
  reason?: string
  owner_path?: string
  owner_classification?: string
} {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.path === 'string' &&
    typeof row.classification === 'string' &&
    (row.reason === undefined || typeof row.reason === 'string') &&
    (row.owner_path === undefined || typeof row.owner_path === 'string') &&
    (row.owner_classification === undefined || typeof row.owner_classification === 'string')
  )
}
