import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  CHECKPOINT_MARKER,
  parseCheckpoint,
  renderCheckpoint,
  type Checkpoint,
} from './shepherd-checkpoint.mts'
import { selectResumeCheckpoint } from './shepherd-checkpoint-resume.mts'
import { updateExactCheckpoint } from './shepherd-checkpoint-update.mts'

const startSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const sessionId = 'sess-0123abcd'

// Omits triggerCommentId by default so this whole suite doubles as coverage that
// selectResumeCheckpoint still parses pre-#8923-round-3 checkpoints lacking the field (#8923 P2).
function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    marker: CHECKPOINT_MARKER,
    repository: 'jonathanong/filaments',
    pr: 8592,
    headRef: 'codex/fix',
    startSha,
    sessionStartSha: startSha,
    runId: '30189230576',
    runUrl: 'https://github.com/jonathanong/filaments/actions/runs/30189230576',
    actor: 'github-actions[bot]',
    sessionId,
    resumeSourceRunId: '',
    status: 'failed',
    createdAt: '2026-07-26T05:35:55Z',
    updatedAt: '2026-07-26T05:35:55Z',
    ...overrides,
  }
}

function context() {
  return {
    repository: 'jonathanong/filaments',
    pr: 8592,
    headRef: 'codex/fix',
    headSha,
    actor: 'github-actions[bot]',
    isAncestor: (candidate: string) => candidate === startSha,
    isShepherdRun: (runId: string) => runId === '30189230576',
  }
}

function trustedBot() {
  return {
    user: { login: 'github-actions[bot]', type: 'Bot' },
    performed_via_github_app: { slug: 'github-actions' },
  }
}

describe('Codex PR shepherd checkpoints', () => {
  it('renders remote session URLs as clickable links', () => {
    const rendered = renderCheckpoint(
      checkpoint({ sessionUrl: 'https://harness.example/sessions/sess-0123abcd' }),
    )
    expect(rendered).toContain(
      'Session: [sess-0123abcd](https://harness.example/sessions/sess-0123abcd)',
    )
    expect(rendered).not.toContain('`[sess-0123abcd]')
  })

  it('uses the higher comment ID when append-only transitions share a timestamp', () => {
    expect(
      selectResumeCheckpoint(
        [
          {
            id: 42,
            ...trustedBot(),
            body: renderCheckpoint(checkpoint({ status: 'running' })),
            created_at: '2026-07-26T05:35:55Z',
          },
          {
            id: 43,
            ...trustedBot(),
            body: renderCheckpoint(checkpoint({ status: 'complete' })),
            created_at: '2026-07-26T05:35:55Z',
          },
        ],
        context(),
      ),
    ).toBeUndefined()
  })

  it('accepts a trusted remote Harness session without a local Codex rollout', () => {
    const result = selectResumeCheckpoint(
      [
        {
          id: 42,
          ...trustedBot(),
          body: renderCheckpoint(checkpoint()),
          created_at: '2026-07-26T05:35:55Z',
        },
      ],
      context(),
    )
    expect(result).toMatchObject({ commentId: 42, checkpoint: { sessionId } })
  })

  it('updates only the exact trusted checkpoint binding with a session URL', () => {
    const comment = {
      id: 42,
      ...trustedBot(),
      body: renderCheckpoint(checkpoint({ triggerCommentId: 100, status: 'queued' })),
    }
    const context = {
      actor: 'github-actions[bot]',
      commentId: 42,
      headRef: 'codex/fix',
      headSha: startSha,
      pr: 8592,
      repository: 'jonathanong/filaments',
      runId: '30189230576',
      triggerCommentId: 100,
    }
    expect(
      parseCheckpoint(
        updateExactCheckpoint(comment, context, 'running', {
          id: sessionId,
          url: `https://harness.example.com/sessions/${sessionId}`,
        }),
      ),
    ).toMatchObject({
      status: 'running',
      sessionId,
      sessionUrl: expect.stringContaining(sessionId),
    })
    for (const override of [{ commentId: 43 }, { headSha }, { pr: 1 }, { runId: '1' }]) {
      expect(() =>
        updateExactCheckpoint(comment, { ...context, ...override }, 'failed', {}),
      ).toThrow('Checkpoint comment')
    }
  })

  it('keeps an awaiting-verification checkpoint resumable until trusted follow-up completes it', () => {
    const awaiting = checkpoint({ status: 'awaiting_verification' })
    const result = selectResumeCheckpoint(
      [
        {
          id: 42,
          ...trustedBot(),
          body: renderCheckpoint(awaiting),
          created_at: '2026-07-26T05:35:55Z',
        },
      ],
      context(),
    )
    expect(result).toMatchObject({
      commentId: 42,
      checkpoint: { sessionId, status: 'awaiting_verification' },
    })
  })

  it('rejects forged, mismatched, malformed, successful, and divergent checkpoints', () => {
    const candidates = [
      {
        value: checkpoint(),
        user: { login: 'human', type: 'User' },
        performed_via_github_app: null,
      },
      {
        value: checkpoint(),
        user: { login: 'github-actions[bot]', type: 'Bot' },
        performed_via_github_app: null,
      },
      {
        value: checkpoint({ repository: 'other/repo' }),
        ...trustedBot(),
      },
      {
        value: checkpoint({ status: 'complete' }),
        ...trustedBot(),
      },
      {
        value: checkpoint({ status: 'unresumable' }),
        ...trustedBot(),
      },
      {
        value: checkpoint({ startSha: 'c'.repeat(40) }),
        ...trustedBot(),
      },
      {
        value: checkpoint({ runId: '999' }),
        ...trustedBot(),
      },
    ]
    for (const [index, candidate] of candidates.entries()) {
      expect(
        selectResumeCheckpoint(
          [
            {
              id: index,
              user: candidate.user,
              performed_via_github_app: candidate.performed_via_github_app,
              body: renderCheckpoint(candidate.value),
            },
          ],
          context(),
        ),
      ).toBeUndefined()
    }
    expect(parseCheckpoint(`<!-- ${CHECKPOINT_MARKER} definitely-not-json -->`)).toBeUndefined()
  })

  it('rejects a session whose original start is not an ancestor of the current head', () => {
    expect(
      selectResumeCheckpoint(
        [
          {
            id: 1,
            ...trustedBot(),
            body: renderCheckpoint(checkpoint({ sessionStartSha: 'c'.repeat(40) })),
          },
        ],
        context(),
      ),
    ).toBeUndefined()
  })

  it.each(['unresumable', 'complete'] as const)(
    'treats a newer %s checkpoint as a tombstone for older resumable state',
    status => {
      const older = checkpoint({ runId: '30189230576', status: 'failed' })
      const tombstone = checkpoint({
        runId: '30190000000',
        resumeSourceRunId: older.runId,
        status,
      })
      expect(
        selectResumeCheckpoint(
          [
            {
              id: 43,
              ...trustedBot(),
              body: renderCheckpoint(tombstone),
              created_at: '2026-07-26T06:00:00Z',
            },
            {
              id: 42,
              ...trustedBot(),
              body: renderCheckpoint(older),
              created_at: '2026-07-26T05:35:55Z',
            },
          ],
          {
            ...context(),
            isShepherdRun: runId => runId === tombstone.runId || runId === older.runId,
          },
        ),
      ).toBeUndefined()
    },
  )

  it('preserves the original trusted session start across descendant-head resumptions', () => {
    const resumedCheckpoint = checkpoint({
      startSha: headSha,
      sessionStartSha: startSha,
      resumeSourceRunId: '30180000000',
    })
    const selection = selectResumeCheckpoint(
      [
        {
          id: 43,
          ...trustedBot(),
          body: renderCheckpoint(resumedCheckpoint),
        },
      ],
      {
        ...context(),
        isAncestor: candidate => candidate === headSha || candidate === startSha,
      },
    )
    expect(selection?.checkpoint).toMatchObject({
      startSha: headSha,
      sessionStartSha: startSha,
      resumeSourceRunId: '30180000000',
    })
  })

  it('renders a versioned machine-readable checkpoint body', () => {
    const value = checkpoint()
    const body = renderCheckpoint(value)
    expect(body).toContain(`<!-- ${CHECKPOINT_MARKER} `)
    expect(body).toContain(value.runUrl)
    expect(parseCheckpoint(body)).toEqual(value)
  })

  it('prints concise CLI failures without a raw stack trace', () => {
    const result = spawnSync(process.execPath, ['ci/shepherd-checkpoint-cli.mts'], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('Usage: checkpoint.mts render|select|update <path>')
  })
})
