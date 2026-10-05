// Shared by artifact-retention-policy.test.mts; extracted to stay under the 300-line Vitest
// test-file cap (same rationale as coverage-summary.test-helpers.mts in this directory).
import { parse, stringify } from 'yaml'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export type UploadArtifactBlock = {
  retentionValue: unknown
  artifactName: unknown
  overwriteValue: unknown
  requiresOverwrite: boolean
  stepSource: string
}

const UPLOAD_ARTIFACT_ACTION = 'actions/upload-artifact'
const UPLOAD_ARTIFACT_MERGE_ACTION = 'actions/upload-artifact/merge'

// GitHub resolves an action reference's owner/repository case-insensitively (only the ref after
// `@` is case-sensitive), so `Actions/Upload-Artifact@v7` is the same action as the lowercase form.
function actionPath(uses: unknown): string | undefined {
  if (typeof uses !== 'string') return undefined
  const separatorIndex = uses.indexOf('@')
  return separatorIndex === -1 ? undefined : uses.slice(0, separatorIndex).toLowerCase()
}

function isUploadArtifactRef(uses: unknown): boolean {
  const path = actionPath(uses)
  return path === UPLOAD_ARTIFACT_ACTION || path === UPLOAD_ARTIFACT_MERGE_ACTION
}

// The official merge sub-action produces/exposes an artifact with its own retention-days and name
// inputs but, unlike the base action, has no `overwrite` input at all — it must never be held to
// the repo-wide overwrite:true requirement.
function isBaseUploadArtifactRef(uses: unknown): boolean {
  return actionPath(uses) === UPLOAD_ARTIFACT_ACTION
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Toolkit input names are case-insensitive; scalar inputs trim surrounding whitespace.
function scalar(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  return isRecord(value) || Array.isArray(value) ? undefined : value
}

function input(map: unknown, name: string): unknown {
  if (!isRecord(map)) return undefined
  const entry = Object.entries(map).find(([key]) => key.trim().toLowerCase() === name)
  return entry?.[1]
}

function collectUploadArtifactBlock(blocks: UploadArtifactBlock[], step: unknown): void {
  if (!isRecord(step)) return
  const uses = scalar(input(step, 'uses'))
  if (!isUploadArtifactRef(uses)) return
  const withInputs = input(step, 'with')
  blocks.push({
    retentionValue: scalar(input(withInputs, 'retention-days')),
    artifactName: scalar(input(withInputs, 'name')),
    overwriteValue: scalar(input(withInputs, 'overwrite')),
    requiresOverwrite: isBaseUploadArtifactRef(uses),
    // Diagnostics show the effective step, including resolved anchors, without AST source ranges.
    stepSource: stringify(step),
  })
}

// The YAML library resolves scalar/key/map/step/sequence aliases into ordinary data. Only direct
// elements of a steps sequence are candidates; multiline strings and with-input decoys stay data.
export function uploadArtifactBlocks(source: string): UploadArtifactBlock[] {
  const workflow: unknown = parse(source)
  const blocks: UploadArtifactBlock[] = []
  const ancestors = new WeakSet<object>()
  function walk(value: unknown): void {
    if (!isRecord(value) && !Array.isArray(value)) return
    if (ancestors.has(value)) return
    ancestors.add(value)
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
    } else {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'steps' && Array.isArray(child))
          for (const step of child) collectUploadArtifactBlock(blocks, step)
        walk(child)
      }
    }
    // Repeated aliases under distinct jobs are separate effective steps, not a cycle.
    ancestors.delete(value)
  }
  walk(workflow)
  return blocks
}

export function invalidRetentionBlocks(source: string): UploadArtifactBlock[] {
  return uploadArtifactBlocks(source).filter(block => String(block.retentionValue) !== '1')
}

export function artifactNameFromBlock(block: UploadArtifactBlock): string {
  if (block.artifactName == null) {
    throw new Error(`No artifact name found in upload-artifact block:\n${block.stepSource}`)
  }
  return stringFromUnknown(block.artifactName).replace(/\$\{\{[^}]*\}\}/g, 'INTERPOLATED')
}
