import { registerWorkerQueueScript, workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { loadScript } from '@data-stores/valkey/scripts'

const abortDelayedJobRegistrationScript = registerWorkerQueueScript(
  loadScript('abort-spend-cap-delayed-job-registration.lua', import.meta.url),
)

type RegistryScriptClient = Pick<typeof workerQueueCommandClient, 'invokeScript'>
export type OpenAiSpendCapRegistration = {
  accepted: boolean
  generation: string
  alreadyMarked?: boolean
}

export function normalizeOpenAiSpendCapRegistration(result: unknown): OpenAiSpendCapRegistration {
  if (!Array.isArray(result) || result.length !== 3) {
    throw new Error('Invalid OpenAI spend-cap registration result')
  }
  const registration: OpenAiSpendCapRegistration = {
    accepted: Number(result[0]) === 1,
    generation: String(result[1]),
  }
  if (Number(result[2]) === 1) registration.alreadyMarked = true
  return registration
}

export async function abortOpenAiSpendCapDelayedJobRegistration(
  key: string,
  field: string,
  generation: string,
  registry: RegistryScriptClient,
  registrationError: unknown,
): Promise<never> {
  const error = toError(registrationError)
  try {
    await registry.invokeScript(abortDelayedJobRegistrationScript, {
      keys: [key],
      args: [generation, field],
    })
  } catch (abortError) {
    const failure = new AggregateError(
      [error, toError(abortError)],
      'Failed to register an OpenAI spend-cap delayed job and abort its reservation',
    )
    failure.cause = error
    throw failure
  }
  throw error
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value })
}
