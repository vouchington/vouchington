import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  collectConfigInventory as collectPublishedConfigInventory,
  type ConfigSourceRules,
} from 'vouchington-tooling/config-inventory'
import { classifyEnvVar } from './classify.mts'
import { collectDynamicConfigReferences } from './dynamic-configs.mts'
import { bucketsForFile, isEnvInventoryDoc, isGithubYaml } from './env-source-buckets.mts'
import { loadTypedEnvContractData } from './load-typed-env-contract.mts'
import { GENERIC_REVIEW_REASON, reviewReasonForEnvVar } from './review-reasons.mts'
import { shouldSkipFile } from './shared.mts'
import type { ConfigInventory, EnvVarInventoryRow } from './types.mts'

const ENV_HELPER_NAMES = ['getNonEmptyEnv', 'getEnv', 'parseEnvPositiveInt'] as const
const SENSITIVITY_ORDER = ['internal', 'public', 'secret'] as const
const RESERVED_ENV_NAMES = new Set(['ARG', 'ENV'])
const MARKDOWN_ENV_NAME_PATTERN = /`([A-Z][A-Z0-9_]{2,})`/g

function readSource(ctx: SharedContext, file: string): string | null {
  if (ctx.readTrackedFile) {
    const contents = ctx.readTrackedFile(file)
    return typeof contents === 'string' ? contents : null
  }
  const fullPath = join(ctx.repoRoot, file)
  if (!existsSync(fullPath)) return null
  return readFileSync(fullPath, 'utf8')
}

export async function collectConfigInventory(ctx: SharedContext): Promise<ConfigInventory> {
  const typedContract = await loadTypedEnvContractData(ctx.repoRoot)
  const inventory = collectPublishedConfigInventory(
    {
      trackedFiles: ctx.trackedFiles,
      readTrackedFile(file) {
        const contents = readSource(ctx, file)
        if (contents === null) return null
        if (file.endsWith('.md') && !isEnvInventoryDoc(file)) {
          // Inventory docs mint backtick names. Other Markdown only attaches references.
          return contents.replaceAll(MARKDOWN_ENV_NAME_PATTERN, '$1')
        }
        return contents
      },
    },
    {
      describeFile,
      envContract: typedContract.entries,
      envConstants: typedContract.constants,
      envHelperNames: ENV_HELPER_NAMES,
      sensitivityOrder: SENSITIVITY_ORDER,
      collectDynamicConfigs: collectDynamicConfigReferences,
      annotateEnv(row) {
        const classifications = classifyEnvVar(row.name, row)
        return {
          classifications,
          reviewReason:
            reviewReasonForEnvVar(row.name) ??
            (classifications.includes('review-required') ? GENERIC_REVIEW_REASON : null),
        }
      },
    },
  )

  return {
    dynamicConfigs: inventory.dynamicConfigs,
    packageGates: inventory.packageGates,
    envVars: inventory.envVars.flatMap(row => {
      const localRow: EnvVarInventoryRow = {
        ...row,
        classifications: classifyEnvVar(row.name, row),
      }
      return keepInventoryRow(localRow) ? [localRow] : []
    }),
  }
}

/**
 * Markdown files skip ordinary `process.env` discovery. Only canonical inventory docs mint
 * backtick names; other Markdown attaches references to names discovered elsewhere.
 */
function describeFile(file: string): ConfigSourceRules | null {
  if (shouldSkipFile(file)) return null
  const referenceBuckets = bucketsForFile(file)
  const rules: ConfigSourceRules = {}
  if (referenceBuckets.length > 0) rules.referenceBuckets = referenceBuckets
  if (file.startsWith('cloudflare-worker/')) rules.workerBindings = true
  if (file === '.env.example' || file.endsWith('/.dev.vars')) rules.localAssignments = true
  if (file === 'dev/initialize') rules.shellExports = true
  if (file === 'cloudflare-worker/wrangler.local.jsonc') rules.jsonBindings = true
  if (file.endsWith('Dockerfile')) rules.docker = true
  if (isGithubYaml(file)) rules.workflow = true
  if (file.endsWith('.md')) rules.markdown = true
  if (file.endsWith('package.json')) rules.packageManifest = true
  if (file === 'pnpm-workspace.yaml') rules.packageManagerConfig = true
  return rules
}

function keepInventoryRow(row: EnvVarInventoryRow): boolean {
  if (RESERVED_ENV_NAMES.has(row.name)) return false
  if (!isDocumentationOnly(row)) return true
  return row.docs.some(isEnvInventoryDoc)
}

function isDocumentationOnly(row: EnvVarInventoryRow): boolean {
  return (
    row.contractKey === null &&
    row.runtimeSurfaces.length === 0 &&
    row.readers.length === 0 &&
    row.localSetup.length === 0 &&
    row.deployment.length === 0 &&
    row.dockerBuildArgs.length === 0 &&
    row.workflows.length === 0 &&
    row.packageGates.length === 0
  )
}
