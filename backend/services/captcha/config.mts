import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'
import { getDeployEnvironment, type DeployEnvironmentSource } from '@ts-shared/deploy-environment'

export type TurnstileConfig = {
  always_approve: boolean
}

const DEFAULTS: TurnstileConfig = {
  always_approve: false,
}

export const TURNSTILE_CONFIG_KEY = 'turnstile-config'

const fieldTypes: Record<keyof TurnstileConfig, 'boolean'> = {
  always_approve: 'boolean',
}

export const turnstileConfig = new DynamicConfig({
  key: TURNSTILE_CONFIG_KEY,
  fieldTypes,
  defaultFields: DEFAULTS,
})

export function getTurnstileConfig(): TurnstileConfig {
  const fields = turnstileConfig.getFields()
  const result: TurnstileConfig = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as Array<keyof TurnstileConfig>) {
    const value = fields[key]
    if (value === undefined) continue
    if (typeof value === typeof DEFAULTS[key]) {
      result[key] = value as boolean
    } else {
      onError(new Error(`Invalid turnstile config field ${key}: ${JSON.stringify(value)}`))
    }
  }
  return result
}

export function isTurnstileAlwaysApprove(
  env: DeployEnvironmentSource = process.env,
  config: TurnstileConfig = getTurnstileConfig(),
): boolean {
  return getDeployEnvironment(env) === 'staging' && config.always_approve === true
}

let loggedAlwaysApproveSkip = false

export function logTurnstileAlwaysApproveSkip(): void {
  if (loggedAlwaysApproveSkip) return
  loggedAlwaysApproveSkip = true
  if (process.env.NODE_ENV === 'test') return
  console.info(
    JSON.stringify({
      msg: 'Turnstile always-approve skip is active',
      namespace: TURNSTILE_CONFIG_KEY,
      environment: 'staging',
    }),
  )
}

export function resetTurnstileAlwaysApproveSkipLogForTests(): void {
  loggedAlwaysApproveSkip = false
}
