import { describe, expect, it } from 'vitest'
import { SQS_CONSUMER_DEFINITIONS as IO_SQS_CONSUMER_DEFINITIONS } from '@entrypoints/worker-io/sqs-consumer-definitions'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'

// worker-cpu re-exports every worker-io SQS consumer definition verbatim (see the comment in
// sqs-consumer-definitions.mts) so worker-cpu can run every consumer assigned by infrastructure,
// does not silently drop io-capable queues such as ses-inbound-sqs. Pin the re-export so a future
// change from spread to a hand-maintained duplicate list can't drift without a test failure.
describe('worker-cpu SQS_CONSUMER_DEFINITIONS', () => {
  it('re-exports every worker-io SQS consumer definition unchanged', () => {
    expect(SQS_CONSUMER_DEFINITIONS).toEqual(IO_SQS_CONSUMER_DEFINITIONS)
    expect(SQS_CONSUMER_DEFINITIONS.map(definition => definition.queueName)).toContain(
      'ses-inbound-sqs',
    )
  })
})
