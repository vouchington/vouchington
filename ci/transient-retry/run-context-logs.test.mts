import { describe, expect, it } from 'vitest'

import { LOG_TOTAL_MAX_BUFFER_BYTES } from './gh-api.mts'
import { createLogFetchers } from './run-context-logs.mts'

describe('createLogFetchers', () => {
  function streamed(value: string | Buffer): AsyncIterable<Buffer> {
    return (async function* () {
      yield typeof value === 'string' ? Buffer.from(value) : value
    })()
  }

  it('fetches failed-job logs serially and caches each result', async () => {
    let active = 0
    let maximumActive = 0
    const fetchers = createLogFetchers({
      allJobEntries: [
        { id: 1, name: 'first', conclusion: 'failure' },
        { id: 2, name: 'second', conclusion: 'failure' },
      ],
      rawJobEntries: [
        { id: 1, name: 'first', conclusion: 'failure' },
        { id: 2, name: 'second', conclusion: 'failure' },
      ],
      repository: 'jonathanong/filaments',
      execFile: async (_command, args) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await Promise.resolve()
        active -= 1
        return { stdout: `${args[1]}`, stderr: '' }
      },
    })

    await expect(fetchers.failedJobLogs()).resolves.toEqual(
      new Map([
        ['first', 'repos/jonathanong/filaments/actions/jobs/1/logs'],
        ['second', 'repos/jonathanong/filaments/actions/jobs/2/logs'],
      ]),
    )
    expect(maximumActive).toBe(1)
  })

  it('does not duplicate a small streamed log', async () => {
    const fetchers = createLogFetchers({
      allJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      rawJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      repository: 'jonathanong/filaments',
      execFile: async () => ({ stdout: '', stderr: '' }),
      streamLogs: true,
      streamLog: () => streamed('terminal failure'),
    })

    await expect(fetchers.failedJobLogs()).resolves.toEqual(new Map([['job', 'terminal failure']]))
  })

  it('removes the head/tail overlap for a medium streamed log', async () => {
    const log = `${'a'.repeat(256 * 1024)}terminal failure`
    const fetchers = createLogFetchers({
      allJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      rawJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      repository: 'jonathanong/filaments',
      execFile: async () => ({ stdout: '', stderr: '' }),
      streamLogs: true,
      streamLog: () => streamed(log),
    })

    await expect(fetchers.failedJobLogs()).resolves.toEqual(new Map([['job', log]]))
  })

  it('retries a retryable streamed log and discards partial diagnostics', async () => {
    let attempts = 0
    const delays: number[] = []
    const fetchers = createLogFetchers({
      allJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      rawJobEntries: [{ id: 1, name: 'job', conclusion: 'failure' }],
      repository: 'jonathanong/filaments',
      execFile: async () => ({ stdout: '', stderr: '' }),
      streamLogs: true,
      sleep: async delay => {
        delays.push(delay)
      },
      streamLog: () =>
        (async function* () {
          attempts += 1
          if (attempts === 1) {
            yield Buffer.from('discard this partial log')
            throw new Error('connection reset by peer')
          }
          yield Buffer.from('terminal failure')
        })(),
    })

    await expect(fetchers.failedJobLogs()).resolves.toEqual(new Map([['job', 'terminal failure']]))
    expect(attempts).toBe(2)
    expect(delays).toEqual([1000])
  })

  it('serializes concurrent streamed logs within the aggregate byte budget', async () => {
    const jobs = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      name: `job-${index + 1}`,
      conclusion: 'failure' as const,
    }))
    const streamCalls = new Map<string, number>()
    const invalidUtf8Log = Buffer.alloc(800 * 1024, 0xff)
    const fetchers = createLogFetchers({
      allJobEntries: jobs,
      rawJobEntries: jobs,
      repository: 'jonathanong/filaments',
      execFile: async () => ({ stdout: '', stderr: '' }),
      streamLogs: true,
      streamLog: path =>
        (async function* () {
          streamCalls.set(path, (streamCalls.get(path) ?? 0) + 1)
          await new Promise(resolve => setImmediate(resolve))
          yield invalidUtf8Log
        })(),
    })

    const [logs] = await Promise.all([
      fetchers.failedJobLogs(),
      ...jobs.map(job => fetchers.jobLogs([job.name])),
    ])
    const retainedBytes = [...logs.values()].reduce(
      (total, log) => total + Buffer.byteLength(log),
      0,
    )
    expect(retainedBytes).toBeLessThanOrEqual(LOG_TOTAL_MAX_BUFFER_BYTES)
    expect(logs.get('job-7')).toContain('\ufffd')
    expect([...streamCalls.values()]).toEqual(jobs.map(() => 1))
  })
})
