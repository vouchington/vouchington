import { describe, expect, it } from 'vitest'

import {
  findRunnerShutdownConsumer,
  isCoverageProducerJob,
  isWebApiShardJob,
} from './runner-shutdown-consumers.mts'

const webApiShard = 'test-web-api / web-api-tests (2)'

describe('web API runner-shutdown consumer', () => {
  it('registers a web API shard as a known consumer and coverage producer', () => {
    expect(isWebApiShardJob(webApiShard)).toBe(true)
    expect(findRunnerShutdownConsumer(webApiShard)).toBeDefined()
    expect(isCoverageProducerJob(webApiShard)).toBe(true)
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
    expect(isCoverageProducerJob(jobName)).toBe(false)
  })
})
