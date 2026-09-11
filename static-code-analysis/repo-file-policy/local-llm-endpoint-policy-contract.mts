import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js'

export const LOCAL_LLM_ENDPOINT_POLICY_CONTRACT = 'api-fixtures/v1/local-llm-endpoint-policy.json'
export const LOCAL_LLM_ENDPOINT_POLICY_SCHEMA =
  'api-fixtures/v1/local-llm-endpoint-policy.schema.json'

type PolicyRow = { id: string }

type Contract = { hostPolicyRows: PolicyRow[]; originPairs: PolicyRow[] }

function formatAjvError(error: ErrorObject): string {
  const path = error.instancePath.length === 0 ? '$' : `$${error.instancePath}`
  return `${path} ${error.message ?? 'is invalid'}`
}

function collectIds(rows: readonly PolicyRow[], seen: Set<string>): string[] {
  const diagnostics: string[] = []
  for (const row of rows) {
    if (seen.has(row.id)) diagnostics.push(`duplicate ID "${row.id}"`)
    else seen.add(row.id)
  }
  return diagnostics
}

export function validateLocalLlmEndpointPolicyContract(
  content: string,
  repoRoot: string,
  trackedFiles: readonly string[],
): string[] {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    return [`$ contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
  }

  const schemaPath = join(repoRoot, LOCAL_LLM_ENDPOINT_POLICY_SCHEMA)
  if (!trackedFiles.includes(LOCAL_LLM_ENDPOINT_POLICY_SCHEMA) || !existsSync(schemaPath))
    return [`${LOCAL_LLM_ENDPOINT_POLICY_SCHEMA} must exist and be tracked`]

  let schema: object
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
  } catch (error) {
    return [
      `${LOCAL_LLM_ENDPOINT_POLICY_SCHEMA} contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }

  let validate
  try {
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  } catch (error) {
    return [
      `${LOCAL_LLM_ENDPOINT_POLICY_SCHEMA} is not a valid schema: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
  if (!validate(value)) return (validate.errors ?? []).map(formatAjvError)

  const contract = value as Contract
  const seen = new Set<string>()
  const diagnostics = [
    ...collectIds(contract.hostPolicyRows, seen),
    ...collectIds(contract.originPairs, seen),
  ]

  return diagnostics
}

export function checkLocalLlmEndpointPolicyContract(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  if (!trackedFiles.includes(LOCAL_LLM_ENDPOINT_POLICY_CONTRACT)) {
    errors.push(
      `::error file=${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}::${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}: file must be tracked`,
    )
    return
  }
  const path = join(repoRoot, LOCAL_LLM_ENDPOINT_POLICY_CONTRACT)
  if (!existsSync(path)) {
    errors.push(
      `::error file=${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}::${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}: file must exist`,
    )
    return
  }
  for (const diagnostic of validateLocalLlmEndpointPolicyContract(
    readFileSync(path, 'utf8'),
    repoRoot,
    trackedFiles,
  )) {
    errors.push(
      `::error file=${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}::${LOCAL_LLM_ENDPOINT_POLICY_CONTRACT}: ${diagnostic}`,
    )
  }
}
