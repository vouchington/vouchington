import { BedrockClient } from '@aws-sdk/client-bedrock'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { BEDROCK_AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

let bedrockClient: BedrockClient | undefined

/* no-mistakes: integration=aws */
export const BedrockControlClient = new Proxy({} as BedrockClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getReceiverBoundProperty(targetObject, prop)
    }
    const target = getBedrockClient()
    return getReceiverBoundProperty(target, prop)
  },
})

function getBedrockClient(): BedrockClient {
  if (!bedrockClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    bedrockClient = new BedrockClient({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
    })
  }

  return bedrockClient
}
