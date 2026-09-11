import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import { getApiEgressProxyUrl, isApiEgressProxyRouteEnabled } from '@modules/api-egress-proxy'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BEDROCK_AWS_REGION } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

let directBedrockRuntimeClient: BedrockRuntimeClient | undefined
let proxiedBedrockRuntimeClient: BedrockRuntimeClient | undefined
let closePromise: Promise<void> | undefined

/* no-mistakes: integration=aws */
export const BedrockEmbeddingsClient = new Proxy({} as BedrockRuntimeClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getClientProperty(targetObject, prop)
    }
    const target = getBedrockRuntimeClient()
    return getClientProperty(target, prop)
  },
})

function getClientProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}

function getBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!isApiEgressProxyRouteEnabled('bedrock_embeddings_enabled')) {
    return getDirectBedrockRuntimeClient()
  }
  if (!proxiedBedrockRuntimeClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    proxiedBedrockRuntimeClient = new BedrockRuntimeClient({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
      requestHandler: new NodeHttpHandler({
        httpsAgent: new HttpsProxyAgent(getApiEgressProxyUrl()),
      }),
    })
  }
  return proxiedBedrockRuntimeClient
}

function getDirectBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!directBedrockRuntimeClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    directBedrockRuntimeClient = new BedrockRuntimeClient({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
    })
  }

  return directBedrockRuntimeClient
}

export async function closeBedrockRuntimeClients(): Promise<void> {
  if (closePromise) return await closePromise
  const direct = directBedrockRuntimeClient
  const proxied = proxiedBedrockRuntimeClient
  directBedrockRuntimeClient = undefined
  proxiedBedrockRuntimeClient = undefined
  direct?.destroy()
  proxied?.destroy()
  closePromise = Promise.resolve()
  return await closePromise
}

addGracefulShutdownDrainCallback(closeBedrockRuntimeClients)
