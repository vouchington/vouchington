import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import { getApiEgressProxyUrl, isApiEgressProxyRouteEnabled } from '@modules/api-egress-proxy'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BEDROCK_AWS_REGION, createAwsRequestHandler } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

type BedrockTransport = {
  getApiEgressProxyUrl: typeof getApiEgressProxyUrl
  isApiEgressProxyRouteEnabled: typeof isApiEgressProxyRouteEnabled
}

export function createBedrockRuntimeClients(
  transport: BedrockTransport = { getApiEgressProxyUrl, isApiEgressProxyRouteEnabled },
) {
  let directBedrockRuntimeClient: BedrockRuntimeClient | undefined
  let proxiedBedrockRuntimeClient: BedrockRuntimeClient | undefined
  let closePromise: Promise<void> | undefined

  const BedrockEmbeddingsClient = new Proxy({} as BedrockRuntimeClient, {
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
    if (!transport.isApiEgressProxyRouteEnabled('bedrock_embeddings_enabled')) {
      return getDirectBedrockRuntimeClient()
    }
    if (!proxiedBedrockRuntimeClient) {
      const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
      proxiedBedrockRuntimeClient = new BedrockRuntimeClient({
        ...(credentials ? { credentials } : {}),
        region: BEDROCK_AWS_REGION,
        requestHandler: createAwsRequestHandler({
          httpsAgent: new HttpsProxyAgent(transport.getApiEgressProxyUrl()),
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
        requestHandler: createAwsRequestHandler(),
      })
    }

    return directBedrockRuntimeClient
  }

  async function closeBedrockRuntimeClients(): Promise<void> {
    if (closePromise) return closePromise
    const direct = directBedrockRuntimeClient
    const proxied = proxiedBedrockRuntimeClient
    directBedrockRuntimeClient = undefined
    proxiedBedrockRuntimeClient = undefined
    direct?.destroy()
    proxied?.destroy()
    closePromise = Promise.resolve()
    return closePromise
  }

  return {
    BedrockEmbeddingsClient,
    closeBedrockRuntimeClients,
    [Symbol.asyncDispose]: closeBedrockRuntimeClients,
  }
}

const bedrockRuntimeClients = createBedrockRuntimeClients()

/* no-mistakes: integration=aws */
export const BedrockEmbeddingsClient = bedrockRuntimeClients.BedrockEmbeddingsClient

export async function closeBedrockRuntimeClients(): Promise<void> {
  return bedrockRuntimeClients.closeBedrockRuntimeClients()
}

addGracefulShutdownDrainCallback(closeBedrockRuntimeClients)
