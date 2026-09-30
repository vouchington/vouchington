import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { isWorkflowEnvAllowlisted } from './workflow-env-allowlists.mts'
import type { ConfigInventory, EnvVarInventoryRow } from './types.mts'

export function checkWorkflowEnvReferences(
  ctx: SharedContext,
  inventory: ConfigInventory,
): string[] {
  const errors: string[] = []

  for (const row of inventory.envVars) {
    for (const file of row.workflows) {
      if (!isWorkflowYaml(file)) continue
      const fullPath = join(ctx.repoRoot, file)
      if (!existsSync(fullPath)) continue

      const source = readFileSync(fullPath, 'utf8')
      if (isWorkflowEnvReferenced(row.name, source)) continue
      if (hasNonWorkflowReference(row)) continue
      if (isWorkflowEnvAllowlisted(row.name)) continue

      errors.push(
        `workflow env ${row.name} in ${file} is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
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
