import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FeedbackDeliveryResult } from 'vouchington-tooling/agent-blackboard'
import { describe, expect, it, vi } from 'vitest'

const appendJournal = vi.fn<typeof import('vouchington-tooling/agent-blackboard').appendJournal>()

function deliveredJournal(): FeedbackDeliveryResult {
  return {
    status: 'delivered',
    sourceEventId: 'event-1',
    pendingCount: 0,
    receipt: {
      sessionId: 'sess-1',
      sourceEventId: 'event-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      timestamp: '2026-01-01T00:00:00.000Z',
      verified: true,
    },
  }
}

vi.mock<typeof import('vouchington-tooling/agent-blackboard')>(
  import('vouchington-tooling/agent-blackboard'),
  () => ({ appendJournal }),
)

const { BlackboardJournalError, runAppend } = await import('../append.mts')

const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

describe('runAppend feedback flags', () => {
  it('rejects an invalid mode before calling appendJournal', async () => {
    appendJournal.mockReset()
    const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-feedback-'))
    try {
      const noteFile = join(dir, 'note.md')
      await writeFile(noteFile, 'a note')
      const rejection = await runAppend(
        ['--file', noteFile, '--session-id', 'sess-1', '--mode', 'batch'],
        HOSTED_ENV,
        dir,
      ).catch((err: unknown) => err)
      expect(rejection).toBeInstanceOf(BlackboardJournalError)
      expect(() => {
        throw rejection
      }).toThrow('--mode must be one of:')
      expect(appendJournal).not.toHaveBeenCalled()
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('forwards explicit coverage, count, and outbox flags', async () => {
    appendJournal.mockReset()
    const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-feedback-'))
    try {
      const noteFile = join(dir, 'note.md')
      await writeFile(noteFile, 'a note')
      appendJournal.mockResolvedValue(deliveredJournal())
      await runAppend(
        [
          '--file',
          noteFile,
          '--session-id',
          'thread-1',
          '--mode',
          'interactive',
          '--source-event-id',
          'event-2',
          '--work-outcome',
          'success',
          '--coverage-status',
          'complete',
          '--coverage-source',
          'ci,local',
          '--dropped-count',
          '0',
          '--outbox-directory',
          dir,
        ],
        { ...HOSTED_ENV, CODEX_THREAD_ID: 'thread-1' },
      )
      expect(appendJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'interactive',
          sourceEventId: 'event-2',
          workOutcome: 'success',
          feedbackCoverage: { status: 'complete', sources: ['ci', 'local'], droppedCount: 0 },
          outboxDirectory: dir,
        }),
      )
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
