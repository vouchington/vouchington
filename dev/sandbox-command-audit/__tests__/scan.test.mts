import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { scanTranscripts } from '../scan.mts'

function claudeEscalationLine(command: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 't1',
          name: 'Bash',
          input: { command, dangerouslyDisableSandbox: true },
        },
      ],
    },
  })
}

function codexWorktreeDenialLine(command: string, errorText: string): string {
  return JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        command: ['/bin/zsh', '-lc', command],
        aggregated_output: errorText,
        exit_code: 128,
        status: 'failed',
      },
    },
  })
}

describe('scanTranscripts', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('carries normalized Codex sandbox failures through transcript scanning', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    const command = 'git branch -m old new'
    const errorText =
      'error: unable to move logfile logs/refs/heads/old to logs/refs/heads/new: Operation not permitted'
    writeFileSync(
      join(codexSessionsDir, 'rollout-denial.jsonl'),
      `${codexWorktreeDenialLine(command, errorText)}\n`,
    )

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.codexSandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command, errorText },
    ])
  })

  it('reads and merges records from both Claude and Codex transcript files', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects', 'proj-a')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    writeFileSync(
      join(projectsDir, 'session-1.jsonl'),
      `${claudeEscalationLine('git push --force')}\n`,
    )
    const codexCommand = 'git rebase --continue'
    const codexErrorText =
      "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Operation not permitted"
    writeFileSync(
      join(codexSessionsDir, 'rollout-1.jsonl'),
      `${codexWorktreeDenialLine(codexCommand, codexErrorText)}\n`,
    )

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.claudeFilesScanned).toBe(1)
    expect(result.codexFilesScanned).toBe(1)
    expect(result.claudeEscalations).toEqual([{ source: 'claude', command: 'git push --force' }])
    expect(result.codexSandboxFailures).toEqual([
      {
        source: 'codex',
        kind: 'worktree-denial',
        command: codexCommand,
        errorText: codexErrorText,
      },
    ])
    expect(result.readErrors).toEqual([])
  })

  it('collects a read error per root when a discovered file cannot be read', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    const claudeFile = join(projectsDir, 'unreadable.jsonl')
    const codexFile = join(codexSessionsDir, 'unreadable.jsonl')
    // A directory named *.jsonl matches the discovery glob but readFile() on it fails —
    // a real-world stand-in for a permissions error without needing to chmod (which
    // isn't reliably reversible/portable across CI runners).
    mkdirSync(claudeFile)
    mkdirSync(codexFile)

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.claudeFilesScanned).toBe(0)
    expect(result.codexFilesScanned).toBe(0)
    expect(result.readErrors).toHaveLength(2)
    expect(result.readErrors.some(error => error.includes(claudeFile))).toBe(true)
    expect(result.readErrors.some(error => error.includes(codexFile))).toBe(true)
  })

  it('scans every file across multiple read batches without dropping records', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects', 'proj-a')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    // 60 files per root spans multiple internal read batches (batch size 25) — this
    // guards the regression found while manually testing --limit against real history,
    // where an unbounded single Promise.all across thousands of multi-MB files OOM'd.
    const fileCount = 60
    for (let i = 0; i < fileCount; i++) {
      writeFileSync(
        join(projectsDir, `session-${i}.jsonl`),
        `${claudeEscalationLine(`echo claude-${i}`)}\n`,
      )
      writeFileSync(
        join(codexSessionsDir, `rollout-${i}.jsonl`),
        `${codexWorktreeDenialLine(
          `git checkout branch-${i}`,
          `fatal: Unable to create '/repo/.git/worktrees/x-${i}/index.lock': Operation not permitted`,
        )}\n`,
      )
    }

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: fileCount,
      repoRoots: [],
    })

    expect(result.claudeFilesScanned).toBe(fileCount)
    expect(result.codexFilesScanned).toBe(fileCount)
    expect(result.claudeEscalations).toHaveLength(fileCount)
    expect(result.codexSandboxFailures).toHaveLength(fileCount)
    expect(result.readErrors).toEqual([])
  })

  it('strips a forked Codex child transcript to its own turns, dropping duplicated parent records', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    const tempRoot = join(root, 'spools')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    mkdirSync(tempRoot)

    const timestamp = '2026-07-13T10:00:00.900Z'
    const sessionSeconds = Math.floor(Date.parse(timestamp) / 1000)
    const line = (record: unknown): string => JSON.stringify(record)
    const childLines = [
      line({
        type: 'session_meta',
        payload: {
          id: 'child',
          session_id: 'parent',
          timestamp,
          source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } },
        },
      }),
      line({
        type: 'event_msg',
        payload: { type: 'task_started', started_at: sessionSeconds - 30 },
      }),
      codexWorktreeDenialLine(
        'git rebase --continue',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Operation not permitted",
      ),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: sessionSeconds } }),
      codexWorktreeDenialLine(
        'git fetch origin',
        "fatal: Unable to create '/repo/.git/worktrees/x/FETCH_HEAD': Operation not permitted",
      ),
    ]
    writeFileSync(join(codexSessionsDir, 'rollout-child.jsonl'), `${childLines.join('\n')}\n`)

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
      tempRoot,
    })

    expect(result.codexFilesScanned).toBe(1)
    expect(result.codexSandboxFailures).toEqual([
      {
        source: 'codex',
        kind: 'worktree-denial',
        command: 'git fetch origin',
        errorText:
          "fatal: Unable to create '/repo/.git/worktrees/x/FETCH_HEAD': Operation not permitted",
      },
    ])
    expect(readdirSync(tempRoot)).toEqual([])
  })

  it('replays an unsegmentable child prefix from disk and removes its temporary spool', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    const tempRoot = join(root, 'spools')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    mkdirSync(tempRoot)
    const timestamp = '2026-07-13T10:00:00.900Z'
    const inherited = codexWorktreeDenialLine(
      'git fetch origin',
      "fatal: Unable to create '/repo/.git/worktrees/x/FETCH_HEAD': Operation not permitted",
    )
    writeFileSync(
      join(codexSessionsDir, 'rollout-unsegmentable.jsonl'),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'child', session_id: 'parent', timestamp, parent_thread_id: 'parent' },
      })}\nnot-json\n${inherited}\n`,
    )

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
      tempRoot,
    })

    expect(result.codexSandboxFailures).toHaveLength(1)
    expect(readdirSync(tempRoot)).toEqual([])
  })

  it('returns an empty result when neither root has any transcript files', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.claudeFilesScanned).toBe(0)
    expect(result.codexFilesScanned).toBe(0)
    expect(result.claudeEscalations).toEqual([])
    expect(result.codexSandboxFailures).toEqual([])
  })
})
