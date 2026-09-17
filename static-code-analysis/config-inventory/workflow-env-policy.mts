import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { matchWorkflowEnvMapNames } from './env-expression-readers.mts'
import { isWorkflowEnvAllowlisted } from './workflow-env-allowlists.mts'
import type { ConfigInventory, EnvVarInventoryRow } from './types.mts'

export function checkWorkflowEnvReferences(
  ctx: SharedContext,
  inventory: ConfigInventory,
): string[] {
  const rows = new Map(inventory.envVars.map(row => [row.name, row]))
  const errors: string[] = []

  for (const file of ctx.trackedFiles) {
    if (!isWorkflowYaml(file)) continue
    const fullPath = join(ctx.repoRoot, file)
    if (!existsSync(fullPath)) continue

    const fileContents = readFileSync(fullPath, 'utf8')
    if (typeof fileContents !== 'string') continue
    const source = fileContents
    for (const name of matchWorkflowEnvMapNames(source)) {
      if (isWorkflowEnvReferenced(name, source)) continue
      if (hasNonWorkflowReference(rows.get(name))) continue
      if (isWorkflowEnvAllowlisted(file, name)) continue

      errors.push(
        `workflow env ${name} in ${file} is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      )
    }
  }

  return errors
}

function isWorkflowYaml(file: string): boolean {
  return file.startsWith('.github/workflows/') && /\.ya?ml$/u.test(file)
}

function hasNonWorkflowReference(row: EnvVarInventoryRow | undefined): boolean {
  if (!row) return false
  return (
    row.readers.length > 0 ||
    row.localSetup.length > 0 ||
    row.docs.length > 0 ||
    row.deployment.length > 0 ||
    row.runtimeSurfaces.length > 0 ||
    row.dockerBuildArgs.length > 0 ||
    row.packageGates.length > 0
  )
}

function isWorkflowEnvReferenced(name: string, source: string): boolean {
  return workflowEnvReferencePattern(name).test(source)
}

function workflowEnvReferencePattern(name: string): RegExp {
  // Workflow YAML can reference env through shell, GitHub expressions, and inline node snippets.
  return new RegExp(
    String.raw`(?:\$\{?${name}\b\}?|\benv\.${name}\b|\bprocess\.env\.${name}\b|\bprocess\.env\[['"]${name}['"]\])`,
  )
}
