import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { makeTestTempDirSync } from './test-temp-root.mts'

const scriptPath = path.join(import.meta.dirname, '..', 'codex-hooks', 'post-tool-use-command.mts')
const worktreeRoot = path.resolve(import.meta.dirname, '..', '..')

// SANDBOX_RUNTIME=1 is the documented skip guard checked first in
// dev/journal-checkpoint/append.mts, before any credential check or network attempt — using it
// keeps these subprocess tests fully offline and deterministic regardless of whatever real
// AGENT_BLACKBOARD_URL/AGENT_BLACKBOARD_TOKEN happen to be set in the ambient environment.
const testDirs: string[] = []

function makeTempDir(): string {
  const dir = makeTestTempDirSync('post-tool-use-command-e2e-')
  testDirs.push(dir)
  return dir
}

function runScript({
  args = [],
  input = '',
  env = {},
}: { args?: string[]; input?: string; env?: NodeJS.ProcessEnv } = {}) {
  const tmpEnv = makeTempDir()
  return spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SANDBOX_RUNTIME: '1', TMPDIR: tmpEnv, ...env },
    input,
    timeout: 10_000,
  })
}

function writeFakeTmux(paneTitle: string): string {
  const dir = makeTempDir()
  writeFileSync(
    path.join(dir, 'tmux'),
    [
      '#!/usr/bin/env bash',
      'case "$1" in',
      `  display-message) printf '%s\\n' ${JSON.stringify(paneTitle)} ;;`,
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  return dir
}

describe('dev/codex-hooks/post-tool-use-command.mts (merged PostToolUse hook subprocess)', () => {
  afterEach(() => {
    testDirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true }))
  })

  it('is a no-op for a non-matching payload — no reminder, no crash, empty stdout', () => {
    const result = runScript({
      args: ['claude'],
      // Clear ambient TMUX_PANE (this dev session itself may run inside tmux) so the assertion
      // reflects the payload, not the runner's environment — spawnSync drops undefined values.
      env: { TMUX_PANE: undefined },
      input: JSON.stringify({
        session_id: 'sess-1',
        tool_input: { command: 'ls -la' },
        tool_name: 'Bash',
        tool_response: { stderr: '', stdout: '' },
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('is a no-op for malformed JSON on stdin', () => {
    const result = runScript({ args: ['claude'], input: 'not valid json{{{' })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('runs the full failure-checkpoint pipeline and stays silent under SANDBOX_RUNTIME', () => {
    const payload = JSON.stringify({
      session_id: `e2e-post-tool-use-command-failure-${randomUUID()}`,
      tool_input: { command: 'npx vitest run some.test.mts' },
      tool_response: 'Error: Exit code 1: boom',
    })
    for (let i = 0; i < 3; i += 1) {
      const result = runScript({ args: ['claude'], env: { TMUX_PANE: undefined }, input: payload })
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe('')
    }
  })

  it('runs the full milestone-checkpoint pipeline and stays silent under SANDBOX_RUNTIME', () => {
    const result = runScript({
      args: ['claude'],
      env: { TMUX_PANE: undefined },
      input: JSON.stringify({
        session_id: `e2e-post-tool-use-command-milestone-${randomUUID()}`,
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_response: {
          stderr: '',
          stdout: 'https://github.com/vouchington/vouchington/pull/9358\n',
        },
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('recognizes a Codex-shaped payload for the journal-checkpoint milestone pipeline too', () => {
    const result = runScript({
      args: ['codex'],
      env: { TMUX_PANE: undefined },
      input: JSON.stringify({
        session_id: `e2e-post-tool-use-command-codex-milestone-${randomUUID()}`,
        tool_input: { command: 'git push origin my-branch' },
        tool_response:
          'To github.com:vouchington/vouchington.git\n   abc123..def456  my-branch -> my-branch\n',
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('emits only the tmux reminder on stdout, even when the same call also fires a journal milestone', () => {
    const tmuxDir = writeFakeTmux('old-task')
    const result = runScript({
      args: ['claude'],
      env: { PATH: `${tmuxDir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1' },
      input: JSON.stringify({
        session_id: `e2e-post-tool-use-command-reminder-${randomUUID()}`,
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_name: 'Bash',
        tool_response: {
          stderr: '',
          stdout: 'https://github.com/vouchington/vouchington/pull/9358\n',
        },
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.additionalContext).toContain('PR created')
  })

  // Cursor runs this same Claude-compat entrypoint with its own `Shell` tool name and a JSON-string
  // `tool_output`; readHookPayload normalizes both, so the exit-code gate still applies.
  function runCursorPrCreate(exitCode: number) {
    const tmuxDir = writeFakeTmux('old-task')
    return runScript({
      args: ['claude'],
      env: { PATH: `${tmuxDir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1' },
      input: JSON.stringify({
        cursor_version: 'present',
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_name: 'Shell',
        tool_output: JSON.stringify({ exitCode, output: '' }),
      }),
    })
  }

  it('reminds after a successful Cursor Shell gh pr create', () => {
    const result = runCursorPrCreate(0)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain('PR created')
  })

  it('stays silent after a failed Cursor Shell gh pr create', () => {
    const result = runCursorPrCreate(1)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('stays silent for the tmux reminder outside tmux', () => {
    const result = runScript({
      args: ['claude'],
      // This test session itself may be running inside tmux (TMUX_PANE set in the ambient env),
      // so explicitly clear it — spawnSync drops undefined-valued env keys entirely.
      env: { TMUX_PANE: undefined },
      input: JSON.stringify({
        session_id: `e2e-post-tool-use-command-no-tmux-${randomUUID()}`,
        tool_input: { command: 'gh pr create --title x --body y' },
        tool_name: 'Bash',
        tool_response: { stderr: '', stdout: '' },
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('ships the merged entrypoint in both configs with an explicit runtime argv', () => {
    const codex = readFileSync(path.join(worktreeRoot, '.codex/config.toml'), 'utf8')
    const claude = readFileSync(path.join(worktreeRoot, '.claude/settings.json'), 'utf8')
    expect(codex).toContain('dev/codex-hooks/post-tool-use-command.mts" codex 2>/dev/null')
    expect(claude).toContain('dev/codex-hooks/post-tool-use-command.mts\\" claude 2>/dev/null')
  })
})
