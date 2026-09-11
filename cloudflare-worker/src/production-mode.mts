export function isProductionMode(env: { PRODUCTION?: string }): boolean {
  const production = env.PRODUCTION?.toLowerCase()
  return Boolean(production) && production !== 'false'
}

export function isProductionValueInvalid(env: { PRODUCTION?: string }): boolean {
  const production = env.PRODUCTION?.toLowerCase()
  return Boolean(production) && production !== 'true' && production !== 'false'
}
