import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import { getApiEgressProxyUrl, isApiEgressProxyRouteEnabled } from '@modules/api-egress-proxy'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BEDROCK_AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

let directBedrockRuntimeClient: BedrockRuntimeClient | undefined
let proxiedBedrockRuntimeClient: BedrockRuntimeClient | undefined

function getBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!isApiEgressProxyRouteEnabled('bedrock_embeddings_enabled')) {
    return getDirectBedrockRuntimeClient()
  }
  if (!proxiedBedrockRuntimeClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    proxiedBedrockRuntimeClient = new BedrockRuntimeClient({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
      requestHandler: createResponseBodyBoundAwsRequestHandler({
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
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
    })
  }

  return directBedrockRuntimeClient
}

/* no-mistakes: integration=aws */
export const BedrockEmbeddingsClient = new Proxy({} as BedrockRuntimeClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getReceiverBoundProperty(targetObject, prop)
    }
    const target = getBedrockRuntimeClient()
    return getReceiverBoundProperty(target, prop)
  },
})

async function closeBedrockRuntimeClients(): Promise<void> {
  const direct = directBedrockRuntimeClient
  const proxied = proxiedBedrockRuntimeClient
  directBedrockRuntimeClient = undefined
  proxiedBedrockRuntimeClient = undefined
  direct?.destroy()
  proxied?.destroy()
}

addGracefulShutdownDrainCallback(closeBedrockRuntimeClients)
