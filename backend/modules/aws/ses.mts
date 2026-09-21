import createHttpError from 'http-errors'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'
import { getSESCredentials, hasSESCredentials } from './credentials.mts'
import { buildRawEmailMessage } from './ses-mime.mts'
import onError from '@modules/on-error'
import { assertValidSendEmailOptions, type SendEmailOptions } from '@modules/utils/email'
import { isProductionEnvironment } from '@ts-shared/deploy-environment'
import {
  SendEmailCommand,
  SendRawEmailCommand,
  SESClient as CreateSESClient,
  type Body,
} from '@aws-sdk/client-ses'

export { buildRawEmailMessage } from './ses-mime.mts'

let client: CreateSESClient | undefined

const TEST_SES_CREDENTIALS = {
  accessKeyId: 'test-ses-access-key-id',
  secretAccessKey: 'test-ses-secret-access-key',
}

// IS_PRODUCTION (not IS_DEPLOYED): staging must NOT BCC the real production mailbox.
export function resolveBccAddress(bccEmailEnv: string | undefined, isProduction: boolean): string {
  // Use `||` so an empty SES_BCC_EMAIL="" env var falls back to the default
  // instead of producing an invalid empty BCC address.
  return bccEmailEnv || (isProduction ? 'bcc@voucha.ai' : 'bcc-dev@voucha.ai')
}

// Re-read per call (not cached at module scope) so tests that reload/mutate env stay isolated;
// behavior in a deployed task is identical either way since ENVIRONMENT never changes at runtime.
export function getBccAddresses(options: Pick<SendEmailOptions, 'allowGlobalBcc'>): string[] {
  if (options.allowGlobalBcc === false) return []
  return [resolveBccAddress(process.env.SES_BCC_EMAIL, isProductionEnvironment())]
}

export const SESClient = new Proxy({} as CreateSESClient, {
  get(_, prop) {
    const target = getSESClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})

/* no-mistakes: integration=aws */
export const sendEmail = (options: SendEmailOptions) => {
  assertValidSendEmailOptions(options)

  /* c8 ignore start -- AWS transport wiring; raw MIME construction is covered separately. */
  if (options.headers) {
    const command = new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(buildRawEmailMessage(options), 'utf-8') },
      Destinations: [
        ...(Array.isArray(options.to) ? options.to : [options.to]),
        ...getBccAddresses(options),
      ],
      Source: options.source || process.env.SES_SOURCE_EMAIL || 'no-reply@voucha.ai',
      ...(options.configurationSetName
        ? { ConfigurationSetName: options.configurationSetName }
        : {}),
    })
    const promise = SESClient.send(command)
    promise.catch(onError)
    return promise
  }
  /* c8 ignore stop */

  const input = {
    Destination: {
      BccAddresses: getBccAddresses(options),
      ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
    },
    Source: options.source || process.env.SES_SOURCE_EMAIL || 'no-reply@voucha.ai',
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: options.subject,
      },
      Body: {} as Body,
    },
    ReplyToAddresses: [options.replyToAddress || 'support@voucha.ai'],
    ...(options.configurationSetName ? { ConfigurationSetName: options.configurationSetName } : {}),
  }
  if (options.text) {
    input.Message.Body.Text = {
      Charset: 'UTF-8',
      Data: options.text,
    }
  }
  if (options.html) {
    input.Message.Body.Html = {
      Charset: 'UTF-8',
      Data: options.html,
    }
  }

  const command = new SendEmailCommand(input)
  const promise = SESClient.send(command)
  promise.catch(onError)
  return promise
}

function getSESClient(): CreateSESClient {
  if (!client) {
    client = new CreateSESClient({
      credentials: getSesClientCredentials(),
      region: AWS_REGION,
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return client
}

export function getSesClientCredentials(env: NodeJS.ProcessEnv = process.env) {
  if (hasSESCredentials(env)) {
    return getSESCredentials(env)
  }

  if (isVitestProcess(env)) {
    return TEST_SES_CREDENTIALS
  }

  // Deployed staging/production uses OpenTofu-managed IAM task roles.
  const environment = env.ENVIRONMENT?.trim()
  if (environment === 'staging' || environment === 'production') {
    return undefined
  }

  throw createMissingSesCredentialsError(env)
}

function isVitestProcess(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || env.VITEST === 'true'
}

function createMissingSesCredentialsError(env: NodeJS.ProcessEnv): Error & { status: 503 } {
  const localSetupMessage =
    'SES credentials are not configured. Email delivery requires SES_AWS_ACCESS_KEY_ID and SES_AWS_SECRET_ACCESS_KEY in ~/voucha.env, then ./dev/initialize web.'
  const deployedMessage = 'Missing SES credentials'
  const message = env.NODE_ENV === 'development' ? localSetupMessage : deployedMessage

  return createHttpError(503, message)
}
