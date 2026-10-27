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

  it('updates the trusted checkpoint with the Harness session', () => {
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
  })

  it('renders a versioned machine-readable checkpoint body', () => {
    const value = checkpoint()
    const body = renderCheckpoint(value)
    expect(body).toContain(CHECKPOINT_MARKER)
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
