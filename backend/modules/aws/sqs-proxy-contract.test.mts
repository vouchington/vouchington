import { SQSClient as CreateSQSClient } from '@aws-sdk/client-sqs'
import { describe, expect, it } from 'vitest'
import { SQSClient } from './sqs.mts'

describe('SQSClient proxy contract', () => {
  it('is not an instanceof the AWS SDK SQSClient, since the lazy Proxy only implements a get trap', () => {
    expect(SQSClient instanceof CreateSQSClient).toBe(false)
  })

  it('still forwards member access through the get trap, lazily constructing the underlying client', () => {
    expect(typeof SQSClient.send).toBe('function')
    expect(SQSClient.config).toBeDefined()
  })
})
