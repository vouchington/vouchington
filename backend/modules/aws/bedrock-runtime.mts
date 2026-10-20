import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import { getApiEgressProxyUrl, isApiEgressProxyRouteEnabled } from '@modules/api-egress-proxy'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BEDROCK_AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
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
        return getReceiverBoundProperty(targetObject, prop)
      }
      const target = getBedrockRuntimeClient()
      return getReceiverBoundProperty(target, prop)
    },
  })

  function getBedrockRuntimeClient(): BedrockRuntimeClient {
    if (!transport.isApiEgressProxyRouteEnabled('bedrock_embeddings_enabled')) {
      return getDirectBedrockRuntimeClient()
    }
    if (!proxiedBedrockRuntimeClient) {
      const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
      proxiedBedrockRuntimeClient = new BedrockRuntimeClient({
        ...(credentials ? { credentials } : {}),
        region: BEDROCK_AWS_REGION,
        requestHandler: createResponseBodyBoundAwsRequestHandler({
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
        requestHandler: createResponseBodyBoundAwsRequestHandler(),
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
