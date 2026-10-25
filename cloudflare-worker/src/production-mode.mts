import { isDeployedEnvironment } from '@vouchington/utils/deploy-environment'
export function isProductionMode(env: { PRODUCTION?: string }): boolean {
  const production = env.PRODUCTION?.toLowerCase()
  return Boolean(production) && production !== 'false'
}

export function isProductionValueInvalid(env: { PRODUCTION?: string }): boolean {
  const production = env.PRODUCTION?.toLowerCase()
  return Boolean(production) && production !== 'true' && production !== 'false'
}

export function isDeployedWorkerEnvironment(env: {
  ENVIRONMENT?: string
  PRODUCTION?: string
}): boolean {
  return isDeployedEnvironment({ ENVIRONMENT: env.ENVIRONMENT }) || isProductionMode(env)
}
