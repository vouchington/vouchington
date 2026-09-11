import { BedrockClient } from '@aws-sdk/client-bedrock'
import { BEDROCK_AWS_REGION } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

let bedrockClient: BedrockClient | undefined

/* no-mistakes: integration=aws */
export const BedrockControlClient = new Proxy({} as BedrockClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getClientProperty(targetObject, prop)
    }
    const target = getBedrockClient()
    return getClientProperty(target, prop)
  },
})

function getClientProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}

function getBedrockClient(): BedrockClient {
  if (!bedrockClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    bedrockClient = new BedrockClient({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
    })
  }

  return bedrockClient
}
