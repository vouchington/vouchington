import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js'

import {
  LIFECYCLE_ADAPTERS,
  LIFECYCLE_FAMILY_CONSUMERS,
  type LifecycleConsumer,
  type LifecycleFamily,
} from './lifecycle-scenario-registry.mts'

export { LIFECYCLE_ADAPTERS, LIFECYCLE_FAMILY_CONSUMERS } from './lifecycle-scenario-registry.mts'

export const LIFECYCLE_SCENARIO_CONTRACT = 'api-fixtures/v1/lifecycle-scenarios.json'
export const LIFECYCLE_SCENARIO_SCHEMA = 'api-fixtures/v1/lifecycle-scenarios.schema.json'

type Scenario = {
  id: string
  family: string
  requiredConsumers: LifecycleConsumer[]
}

type Claim = {
  scenarioId: string
  consumer: LifecycleConsumer
  adapter: string
}

type Contract = { scenarios: Scenario[]; claims: Claim[] }

function formatAjvError(error: ErrorObject): string {
  const path = error.instancePath.length === 0 ? '$' : `$${error.instancePath}`
  return `${path} ${error.message ?? 'is invalid'}`
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(value => right.includes(value))
}

export function validateLifecycleScenarioContract(
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

  const schemaPath = join(repoRoot, LIFECYCLE_SCENARIO_SCHEMA)
  if (!trackedFiles.includes(LIFECYCLE_SCENARIO_SCHEMA) || !existsSync(schemaPath))
    return [`${LIFECYCLE_SCENARIO_SCHEMA} must exist and be tracked`]

  let schema: object
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
  } catch (error) {
    return [
      `${LIFECYCLE_SCENARIO_SCHEMA} contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }

  let validate
  try {
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  } catch (error) {
    return [
      `${LIFECYCLE_SCENARIO_SCHEMA} is not a valid schema: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
  if (!validate(value)) return (validate.errors ?? []).map(formatAjvError)

  const contract = value as Contract
  const diagnostics: string[] = []
  const scenarios = new Map<string, Scenario>()
  for (const scenario of contract.scenarios) {
    if (scenarios.has(scenario.id)) diagnostics.push(`duplicate scenario ID "${scenario.id}"`)
    else scenarios.set(scenario.id, scenario)
    const policy = Object.hasOwn(LIFECYCLE_FAMILY_CONSUMERS, scenario.family)
      ? LIFECYCLE_FAMILY_CONSUMERS[scenario.family as LifecycleFamily]
      : undefined
    if (!policy) {
      diagnostics.push(`scenario "${scenario.id}" has unknown family "${scenario.family}"`)
    } else if (!sameMembers(scenario.requiredConsumers, policy)) {
      diagnostics.push(
        `scenario "${scenario.id}" requiredConsumers must exactly match ${scenario.family} policy: ${policy.join(', ')}`,
      )
    }
  }

  const claims = new Set<string>()
  for (const claim of contract.claims) {
    const scenario = scenarios.get(claim.scenarioId)
    if (!scenario) {
      diagnostics.push(
        `claim for ${claim.consumer} claims nonexistent scenario "${claim.scenarioId}"`,
      )
      continue
    }
    const key = `${claim.scenarioId}:${claim.consumer}`
    if (claims.has(key))
      diagnostics.push(`scenario "${claim.scenarioId}" has duplicate ${claim.consumer} claim`)
    else claims.add(key)
    const adapter = LIFECYCLE_ADAPTERS[claim.adapter as keyof typeof LIFECYCLE_ADAPTERS]
    if (!adapter) {
      if (claim.consumer === 'swift' || claim.consumer === 'dotnet') {
        if (!scenario.requiredConsumers.includes(claim.consumer))
          diagnostics.push(`scenario "${claim.scenarioId}" has unexpected ${claim.consumer} claim`)
        continue
      }
      diagnostics.push(`claim references unknown adapter "${claim.adapter}"`)
      continue
    }
    if (adapter.consumer !== claim.consumer) {
      diagnostics.push(
        `adapter "${claim.adapter}" is not compatible with consumer ${claim.consumer}`,
      )
    }
    if (!(adapter.families as readonly string[]).includes(scenario.family)) {
      diagnostics.push(`adapter "${claim.adapter}" does not cover family ${scenario.family}`)
    }
    if (!scenario.requiredConsumers.includes(claim.consumer)) {
      diagnostics.push(`scenario "${claim.scenarioId}" has unexpected ${claim.consumer} claim`)
    }
  }

  for (const scenario of contract.scenarios) {
    for (const consumer of scenario.requiredConsumers) {
      if (!claims.has(`${scenario.id}:${consumer}`))
        diagnostics.push(`scenario "${scenario.id}" is missing ${consumer} claim`)
    }
  }

  for (const [name, adapter] of Object.entries(LIFECYCLE_ADAPTERS)) {
    for (const evidence of Object.values(adapter.evidence)) {
      if (!trackedFiles.includes(evidence) || !existsSync(join(repoRoot, evidence))) {
        diagnostics.push(`adapter "${name}" evidence must exist and be tracked: ${evidence}`)
      }
    }
    const manifestPath = join(repoRoot, adapter.evidence.manifest)
    if (
      existsSync(manifestPath) &&
      !readFileSync(manifestPath, 'utf8').includes('lifecycle-scenarios.json')
    ) {
      diagnostics.push(
        `adapter "${name}" manifest evidence must consume lifecycle-scenarios.json: ${adapter.evidence.manifest}`,
      )
    }
    const dispatchPath = join(repoRoot, adapter.evidence.dispatch)
    if (existsSync(dispatchPath) && !readFileSync(dispatchPath, 'utf8').includes(name)) {
      diagnostics.push(
        `adapter "${name}" dispatch evidence must use its canonical adapter name: ${adapter.evidence.dispatch}`,
      )
    }
  }
  return diagnostics
}

export function checkLifecycleScenarioContract(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  if (!trackedFiles.includes(LIFECYCLE_SCENARIO_CONTRACT)) {
    errors.push(
      `::error file=${LIFECYCLE_SCENARIO_CONTRACT}::${LIFECYCLE_SCENARIO_CONTRACT}: file must be tracked`,
    )
    return
  }
  const path = join(repoRoot, LIFECYCLE_SCENARIO_CONTRACT)
  if (!existsSync(path)) {
    errors.push(
      `::error file=${LIFECYCLE_SCENARIO_CONTRACT}::${LIFECYCLE_SCENARIO_CONTRACT}: file must exist`,
    )
    return
  }
  for (const diagnostic of validateLifecycleScenarioContract(
    readFileSync(path, 'utf8'),
    repoRoot,
    trackedFiles,
  )) {
    errors.push(
      `::error file=${LIFECYCLE_SCENARIO_CONTRACT}::${LIFECYCLE_SCENARIO_CONTRACT}: ${diagnostic}`,
    )
  }
}
