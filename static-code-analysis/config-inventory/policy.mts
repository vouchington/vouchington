import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { collectConfigInventory } from './collect.mts'
import { isCanonicalEnvironmentVariablesReference } from './env-source-buckets.mts'
import { GENERIC_REVIEW_REASON } from './review-reasons.mts'
import type { ConfigInventory, EnvVarInventoryRow } from './types.mts'
import { checkWorkflowEnvReferences } from './workflow-env-policy.mts'

const ENV_VAR_INDEX_DOC = 'docs/overview/infrastructure/environment-variables.md'
const LOCAL_ENV_VAR_DOC = 'docs/development/local-env-vars.md'
const DEV_README = 'dev/README.md'
const DEV_COMMAND_CATALOG_DOC = 'dev/reference-command-catalog.md'
const DOC_CROSS_LINKS = [
  ENV_VAR_INDEX_DOC,
  'docs/overview/architecture/dynamic-config.md',
  LOCAL_ENV_VAR_DOC,
  DEV_COMMAND_CATALOG_DOC,
  'static-code-analysis/README.md',
] as const

const CONFIG_INVENTORY_LINK_RE = /\.?\/?dev\/config-inventory/
const DEV_COMMAND_CATALOG_ROUTE = '[Command Catalog](reference-command-catalog.md)'

type CanonicalDocReader = (path: string) => Promise<unknown>

interface ConfigInventoryPolicyOptions {
  readCanonicalDoc?: CanonicalDocReader
}

async function readCrossLinkedDoc(
  ctx: SharedContext,
  file: string,
  errors: string[],
  reader: CanonicalDocReader,
): Promise<string | null> {
  if (!ctx.trackedFileSet.has(file)) {
    errors.push(`${file} is untracked; config inventory docs cannot be cross-linked`)
  }

  let content: unknown
  try {
    content = await reader(join(ctx.repoRoot, file))
  } catch {
    errors.push(`${file} is missing or unreadable; config inventory docs cannot be cross-linked`)
    return null
  }
  if (typeof content === 'string') return content
  errors.push(
    `${file} returned ${typeof content}; config inventory docs must be readable text to be cross-linked`,
  )
  return null
}

export async function checkConfigInventoryPolicy(
  ctx: SharedContext,
  options: ConfigInventoryPolicyOptions = {},
): Promise<{ errors: string[] }> {
  const errors: string[] = []
  if (!ctx.isInsideGitRepo) {
    errors.push(`::error::${ctx.repoRoot} is not inside a git repository`)
    return { errors }
  }

  let inventory: ConfigInventory
  try {
    inventory = await collectConfigInventory(ctx)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    return { errors }
  }
  errors.push(...checkWorkflowEnvReferences(ctx, inventory))
  if (inventory.envVars.length === 0) {
    errors.push('config inventory did not discover any environment variables')
  }
  if (inventory.packageGates.length === 0) {
    errors.push('config inventory did not discover package-manager gates')
  }
  errors.push(...checkTypedEnvDocDrift(inventory.envVars))

  for (const row of inventory.envVars) {
    const classifications = new Set(row.classifications)
    if (row.classifications.length === 0) {
      errors.push(`env var ${row.name} has no migration classification`)
    }
    if (
      classifications.has('review-required') &&
      (!row.reviewReason || row.reviewReason === GENERIC_REVIEW_REASON)
    ) {
      errors.push(`env var ${row.name} needs a review reason for ambiguous classification`)
    }
  }

  for (const row of inventory.dynamicConfigs) {
    if (row.definitionFiles.length > 0 && row.registryFiles.length === 0) {
      errors.push(`DynamicConfig namespace ${row.namespace} is not registered in admin inventory`)
    }
  }

  const readDoc = options.readCanonicalDoc ?? (path => readFile(path, 'utf8'))
  for (const file of DOC_CROSS_LINKS) {
    const content = await readCrossLinkedDoc(ctx, file, errors, readDoc)
    if (content !== null && !CONFIG_INVENTORY_LINK_RE.test(content)) {
      errors.push(`${file} must mention ./dev/config-inventory`)
    }
  }

  const devReadme = await readCrossLinkedDoc(ctx, DEV_README, errors, readDoc)
  if (devReadme !== null && !devReadme.includes(DEV_COMMAND_CATALOG_ROUTE)) {
    errors.push(`${DEV_README} must link to ${DEV_COMMAND_CATALOG_DOC}`)
  }

  return { errors }
}

function checkTypedEnvDocDrift(rows: readonly EnvVarInventoryRow[]): string[] {
  const errors: string[] = []
  for (const row of rows) {
    if (!row.contractKey) continue
    if (!row.docs.some(isCanonicalEnvironmentVariablesReference)) {
      errors.push(
        `typed env var ${row.name} from ${row.contractKey} is missing from a canonical docs/overview/infrastructure/reference-environment-variables-*.md leaf`,
      )
    }
    if (hasLocalSurface(row) && !row.docs.includes(LOCAL_ENV_VAR_DOC)) {
      errors.push(
        `typed local env var ${row.name} from ${row.contractKey} is missing from ${LOCAL_ENV_VAR_DOC}`,
      )
    }
  }
  return errors
}

function hasLocalSurface(row: EnvVarInventoryRow): boolean {
  return row.runtimeSurfaces.some(surface => surface.startsWith('local-'))
}
