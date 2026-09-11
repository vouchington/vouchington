import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  analyzePostPublicationWriterSource,
  type PostPublicationWriterSourceAnalysis,
} from './post-publication-writer-inventory-analysis.mts'

const INVENTORY_PATH = 'static-code-analysis/post-publication-writer-inventory.json'
const CAPTURE_API = 'backend/services/post-publication/capture.mts'
const WRITER_ROOTS = [
  'backend/agents/',
  'backend/entrypoints/',
  'backend/services/',
  'backend/workers/',
]

type Inventory = {
  version: 1
  capture_api: string
  captured_writers: string[]
  excluded_writers: Array<{ path: string; reason: string }>
}

export function checkPostPublicationWriterInventory(ctx: SharedContext, errors: string[]): void {
  if (!ctx.trackedFileSet.has(INVENTORY_PATH)) {
    if (ctx.trackedFileSet.has(CAPTURE_API))
      errors.push(`${INVENTORY_PATH}: missing required post-publication writer inventory`)
    return
  }
  const content = ctx.readTrackedFile?.(INVENTORY_PATH)
  if (content == null) {
    errors.push(`${INVENTORY_PATH}: missing required post-publication writer inventory`)
    return
  }
  let inventory: Inventory
  try {
    inventory = JSON.parse(content) as Inventory
  } catch {
    errors.push(`${INVENTORY_PATH}: invalid JSON`)
    return
  }
  if (
    inventory.version !== 1 ||
    inventory.capture_api !== CAPTURE_API ||
    !Array.isArray(inventory.captured_writers) ||
    !Array.isArray(inventory.excluded_writers)
  ) {
    errors.push(`${INVENTORY_PATH}: expected versioned capture and writer arrays`)
    return
  }
  const classified = new Set(inventory.captured_writers)
  const analyses = new Map<string, PostPublicationWriterSourceAnalysis | null>()
  const getAnalysis = (path: string): PostPublicationWriterSourceAnalysis | null => {
    if (analyses.has(path)) return analyses.get(path) ?? null
    const source = ctx.readTrackedFile?.(path)
    const analysis = source == null ? null : analyzePostPublicationWriterSource(source, path)
    analyses.set(path, analysis)
    return analysis
  }
  for (const exclusion of inventory.excluded_writers) {
    if (
      !exclusion ||
      typeof exclusion.path !== 'string' ||
      typeof exclusion.reason !== 'string' ||
      !exclusion.reason.trim()
    )
      errors.push(`${INVENTORY_PATH}: exclusions require a path and reason`)
    else classified.add(exclusion.path)
  }
  for (const path of classified)
    if (!ctx.trackedFileSet.has(path)) errors.push(`${INVENTORY_PATH}: stale tracked path ${path}`)
  for (const path of inventory.captured_writers) {
    if (!getAnalysis(path)?.callsApprovedCaptureHelper)
      errors.push(
        `${INVENTORY_PATH}: captured writer ${path} must call an approved publication capture helper`,
      )
  }
  for (const path of ctx.trackedFiles) {
    if (!isPostPublicationWriterSourcePath(path)) continue
    const analysis = getAnalysis(path)
    if (analysis && writesEligibilityState(analysis) && !classified.has(path))
      errors.push(`${INVENTORY_PATH}: unclassified publication writer ${path}`)
  }
}

function writesEligibilityState(analysis: PostPublicationWriterSourceAnalysis): boolean {
  return (
    analysis.writesGeneratedRelationTable ||
    analysis.writesConfigEntityTable ||
    analysis.optsOutOfPublicationCapture ||
    analysis.writesEligibilityTable
  )
}

function isPostPublicationWriterSourcePath(path: string): boolean {
  return (
    WRITER_ROOTS.some(root => path.startsWith(root)) &&
    path.endsWith('.mts') &&
    !path.includes('.test.')
  )
}
