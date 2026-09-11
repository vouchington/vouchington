import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

type RuntimeSecretOptions = {
  parameterEnvName: string
  valueEnvName: string
}

type CachedParameter = {
  expiresAt: number
  value: string
}

const cacheTtlMs = 5 * 60 * 1000
const cachedParameters = new Map<string, CachedParameter>()
let ssmClient: SSMClient | undefined

export async function resolveRuntimeSecret({
  parameterEnvName,
  valueEnvName,
}: RuntimeSecretOptions): Promise<string | undefined> {
  const directValue = process.env[valueEnvName]?.trim()
  if (directValue) {
    assertNotPlaceholderSecret(directValue, valueEnvName)
    return directValue
  }

  const parameterName = process.env[parameterEnvName]?.trim()
  if (!parameterName) return undefined

  const cached = cachedParameters.get(parameterName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const response = await getSsmClient().send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  )
  const value = response.Parameter?.Value?.trim()
  if (!value) {
    throw new Error(`SSM parameter ${parameterName} did not contain a value`)
  }
  assertNotPlaceholderSecret(value, `SSM parameter ${parameterName}`)

  cachedParameters.set(parameterName, {
    expiresAt: Date.now() + cacheTtlMs,
    value,
  })
  return value
}

function getSsmClient(): SSMClient {
  ssmClient ??= new SSMClient({})
  return ssmClient
}

function assertNotPlaceholderSecret(value: string, label: string): void {
  if (value.toUpperCase() === 'PLACEHOLDER') {
    throw new Error(`${label} is still set to the placeholder value`)
  }
}
