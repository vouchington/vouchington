import { describe, expect, it } from 'vitest'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'

describe('worker-io SQS_CONSUMER_DEFINITIONS', () => {
  it('each definition points at the expected lazy import export', () => {
    expect(SQS_CONSUMER_DEFINITIONS.map(definition => definition.queueName)).toEqual([
      'bedrock-batch-sqs',
      'ses-bounce-sqs',
      'ses-inbound-sqs',
      'stripe-events-sqs',
    ])
    const [bedrockDefinition, sesBounceDefinition, sesInboundDefinition, stripeEventsDefinition] =
      SQS_CONSUMER_DEFINITIONS
    const bedrockLoadSource = bedrockDefinition!.load.toString()
    expect(bedrockLoadSource).toContain('bedrock-batch-sqs')
    expect(bedrockLoadSource).toMatch(/\bloadBedrockBatchSqs\b/)
    const sesBounceLoadSource = sesBounceDefinition!.load.toString()
    expect(sesBounceLoadSource).toContain('ses-bounce-sqs')
    expect(sesBounceLoadSource).toMatch(/\bloadSesBounceSqs\b/)
    const sesInboundLoadSource = sesInboundDefinition!.load.toString()
    expect(sesInboundLoadSource).toContain('ses-inbound-sqs')
    expect(sesInboundLoadSource).toMatch(/\bloadSesInboundSqs\b/)
    const stripeEventsLoadSource = stripeEventsDefinition!.load.toString()
    expect(stripeEventsLoadSource).toContain('stripe-events-sqs')
    expect(stripeEventsLoadSource).toMatch(/\bloadStripeEventsSqs\b/)
  })

  it('bedrock-batch-sqs definition load resolves to null when unconfigured', async () => {
    const definition = SQS_CONSUMER_DEFINITIONS.find(
      candidate => candidate.queueName === 'bedrock-batch-sqs',
    )!

    await expect(definition.load()).resolves.toBeNull()
  })

  it('ses-bounce-sqs definition load resolves to null when unconfigured', async () => {
    const definition = SQS_CONSUMER_DEFINITIONS.find(
      candidate => candidate.queueName === 'ses-bounce-sqs',
    )!

    await expect(definition.load()).resolves.toBeNull()
  })

  it('ses-inbound-sqs definition load resolves to null when unconfigured', async () => {
    const definition = SQS_CONSUMER_DEFINITIONS.find(
      candidate => candidate.queueName === 'ses-inbound-sqs',
    )!

    await expect(definition.load()).resolves.toBeNull()
  })

  it('stripe-events-sqs definition load resolves to null when unconfigured', async () => {
    const definition = SQS_CONSUMER_DEFINITIONS.find(
      candidate => candidate.queueName === 'stripe-events-sqs',
    )!

    await expect(definition.load()).resolves.toBeNull()
  })
})
