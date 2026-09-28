import { describe, expect, it } from 'vitest'

import {
  findRunnerShutdownConsumer,
  isWebApiShardJob,
} from './runner-shutdown-consumer-registry.mts'

const webApiShard = 'test-web-api / web-api-tests (2)'

describe('web API runner-shutdown consumer', () => {
  it.each(['test-tooling / tooling', 'static-web / static-web', 'storybook / storybook'])(
    'retains the area consumer %s',
    jobName => {
      expect(findRunnerShutdownConsumer(jobName)).toBeDefined()
    },
  )

  it('registers a web API shard as a known consumer', () => {
    expect(isWebApiShardJob(webApiShard)).toBe(true)
    expect(findRunnerShutdownConsumer(webApiShard)).toBeDefined()
  })

  it.each([
    'test-web-api / web-api-tests (0)',
    'test-web-api / web-api-tests (-1)',
    'test-web-api / web-api-tests (two)',
    'test-web-api / web-integration-tests (2)',
    'test-web / web-api-tests (2)',
    'test-web-api / web-api-tests (2) trailing',
  ])('rejects lookalike web API job %s', jobName => {
    expect(isWebApiShardJob(jobName)).toBe(false)
    expect(findRunnerShutdownConsumer(jobName)).toBeUndefined()
  })
})
