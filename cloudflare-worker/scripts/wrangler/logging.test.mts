import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWranglerLogStreams, flushLogs } from './logging.mts'

describe('flushLogs', () => {
  it('finishes each log stream and persists content before resolving', async () => {
    const logDirectory = mkdtempSync(join(tmpdir(), 'voucha-wrangler-logs-test-'))
    try {
      const streams = createWranglerLogStreams(logDirectory)

      streams.stdoutLog?.write('stdout entry\n')
      streams.stderrLog?.write('stderr entry\n')
      streams.eventsLog?.write('event entry\n')

      await flushLogs(streams)

      expect(streams.stdoutLog?.writableFinished).toBe(true)
      expect(streams.stderrLog?.writableFinished).toBe(true)
      expect(streams.eventsLog?.writableFinished).toBe(true)
      expect(readFileSync(join(logDirectory, 'wrangler-stdout.log'), 'utf8')).toBe('stdout entry\n')
      expect(readFileSync(join(logDirectory, 'wrangler-stderr.log'), 'utf8')).toBe('stderr entry\n')
      expect(readFileSync(join(logDirectory, 'wrangler-events.ndjson'), 'utf8')).toBe(
        'event entry\n',
      )
    } finally {
      rmSync(logDirectory, { force: true, recursive: true })
    }
  })
})
