import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  discoverPublicPostReaders,
  sourceImportsAndComposesAny,
} from './post-publication-reader-inventory-source.mts'
import { composesPublicEligibilityView } from './post-publication-reader-inventory-public-view.mts'
import { isInventory, validateRows } from './post-publication-reader-inventory-validation.mts'
import {
  CANONICAL_BUILDER,
  INVENTORY_PATH,
  type ReaderInventory,
} from './post-publication-reader-inventory-types.mts'

export function checkPostPublicationReaderInventory(ctx: SharedContext, errors: string[]): void {
  if (!ctx.trackedFileSet.has(INVENTORY_PATH)) {
    if (ctx.trackedFileSet.has(CANONICAL_BUILDER)) {
      errors.push(`${INVENTORY_PATH}: missing required post-publication reader inventory`)
    }
    return
  }
  const content = ctx.readTrackedFile?.(INVENTORY_PATH)
  if (content === null || content === undefined) {
    errors.push(`${INVENTORY_PATH}: unable to read tracked post-publication reader inventory`)
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    errors.push(`${INVENTORY_PATH}: invalid JSON`)
    return
  }
  if (!isInventory(parsed)) {
    errors.push(`${INVENTORY_PATH}: expected an inventory object with all reader arrays`)
    return
  }
  const inventory = parsed

  if (inventory.version !== 1) errors.push(`${INVENTORY_PATH}: expected version 1`)
  if (inventory.canonical_builder !== CANONICAL_BUILDER) {
    errors.push(`${INVENTORY_PATH}: canonical_builder must be ${CANONICAL_BUILDER}`)
  }
  const rowsAreValid = [
    validateRows(ctx, inventory.implemented, 'implemented', errors),
    validateRows(ctx, inventory.pr2_baseline, 'pr2_baseline', errors),
    validateRows(ctx, inventory.classified_exceptions, 'classified_exceptions', errors),
  ].every(Boolean)
  if (!rowsAreValid) return
  validateExceptionOwners(inventory, errors)
  if (inventory.implemented.length === 0)
    errors.push(`${INVENTORY_PATH}: implemented must name at least one direct reader`)
  if (inventory.pr2_baseline.length > 0)
    errors.push(`${INVENTORY_PATH}: pr2_baseline must be empty after PR 2`)

  const classifiedPaths = new Set([
    ...inventory.implemented.map(row => row.path),
    ...inventory.pr2_baseline.map(row => row.path),
    ...inventory.classified_exceptions.map(row => row.path),
  ])
  if (
    classifiedPaths.size !==
    inventory.implemented.length +
      inventory.pr2_baseline.length +
      inventory.classified_exceptions.length
  ) {
    errors.push(`${INVENTORY_PATH}: a reader path may have only one classification`)
  }
  for (const row of inventory.implemented) validateImplementedComposition(ctx, row, errors)
  for (const path of discoverPublicPostReaders(ctx)) {
    if (!classifiedPaths.has(path)) {
      errors.push(`${INVENTORY_PATH}: unclassified public post reader ${path}`)
    }
  }
}

function validateExceptionOwners(inventory: ReaderInventory, errors: string[]): void {
  const classified = new Map(
    inventory.classified_exceptions.map(row => [row.path, row.classification]),
  )
  const implemented = new Map(inventory.implemented.map(row => [row.path, row.classification]))
  for (const exception of inventory.classified_exceptions) {
    if (!exception.owner_path || !exception.owner_classification) continue
    if (
      exception.owner_path === CANONICAL_BUILDER &&
      exception.owner_classification === 'canonical-builder'
    ) {
      continue
    }
    if (exception.owner_path === exception.path) {
      errors.push(
        `${INVENTORY_PATH}: classified_exceptions owner must differ from its exception path`,
      )
      continue
    }
    const ownerClassification =
      implemented.get(exception.owner_path) ?? classified.get(exception.owner_path)
    if (!ownerClassification) {
      errors.push(
        `${INVENTORY_PATH}: classified_exceptions owner ${exception.owner_path} is not classified`,
      )
    } else if (ownerClassification !== exception.owner_classification) {
      errors.push(
        `${INVENTORY_PATH}: classified_exceptions owner classification must match ${exception.owner_path}`,
      )
    }
  }
}

function validateImplementedComposition(
  ctx: SharedContext,
  row: ReaderInventory['implemented'][number],
  errors: string[],
): void {
  const content = ctx.readTrackedFile?.(row.path)
  if (content === null || content === undefined) return
  const requiredSymbolGroups = {
    'anonymous-snapshot-sql': [
      'buildDirectPostEligibilityFilter',
      'buildPublicPostEligibilityFilter',
    ],
    'direct-sql': ['buildDirectPostEligibilityFilter', 'buildDirectPostAccessFilter'],
    'mixed-discovery-sql': [
      'buildPublicPostEligibilityFilter',
      'buildViewerPostDiscoveryEligibilityFilter',
    ],
    'public-sql': ['buildPublicPostEligibilityFilter'],
    'public-view': [],
    'viewer-discovery-sql': ['buildViewerPostDiscoveryEligibilityFilter'],
  }[row.classification]
  if (row.classification === 'public-view') {
    const composesEligibilityByPostId = composesPublicEligibilityView(content)
    if (!composesEligibilityByPostId) {
      errors.push(
        `${INVENTORY_PATH}: implemented ${row.path} must compose view_public_post_eligibility`,
      )
    }
    return
  }
  const composesRequiredSymbols =
    row.classification === 'mixed-discovery-sql' || row.classification === 'anonymous-snapshot-sql'
      ? requiredSymbolGroups.every(symbol => sourceImportsAndComposesAny(content, [symbol]))
      : sourceImportsAndComposesAny(content, requiredSymbolGroups)
  if (!composesRequiredSymbols) {
    errors.push(
      `${INVENTORY_PATH}: implemented ${row.path} must compose ${requiredSymbolGroups.join(', ')}`,
    )
  }
}
