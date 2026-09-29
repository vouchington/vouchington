import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { makeTestTempDirSync } from './test-temp-root.mts'

const scriptPath = path.join(import.meta.dirname, '..', 'codex-hooks', 'post-tool-use-command.mts')
const worktreeRoot = path.resolve(import.meta.dirname, '..', '..')

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
    env: {
      ...process.env,
      TMPDIR: tmpEnv,
      TMUX: undefined,
      TMUX_PANE: undefined,
      AGENT_TMUX_SOCKET: undefined,
      AGENT_TMUX_PANE: undefined,
      AGENT_TMUX_WORKTREE: undefined,
      ...env,
    },
    input,
    timeout: 10_000,
  })
}

function fakeTmuxBinding() {
  const dir = makeTempDir()
  return {
    AGENT_TMUX_SOCKET: path.join(dir, 'tmux.sock'),
    AGENT_TMUX_PANE: '%1',
    AGENT_TMUX_WORKTREE: worktreeRoot,
    VOUCHA_TMUX_BIN: path.join(worktreeRoot, 'dev', 'test-helpers', 'tmux-target-fake.sh'),
    FAKE_TMUX_PANE_PATH: worktreeRoot,
    FAKE_TMUX_TITLE: 'old-task',
  }
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

  // Calls the hook once journaled on the agent's behalf (a repeated test failure, a PR-create or
  // push milestone) are now ordinary: no journal side effect and nothing on stdout outside tmux.
  it.each([
    [
      'claude',
      { command: 'npx vitest run some.test.mts' },
      'Error: Exit code 1: boom',
      { repeat: 3 },
    ],
    [
      'claude',
      { command: 'gh pr create --title x --body y' },
      { stderr: '', stdout: 'https://github.com/vouchington/vouchington/pull/9358\n' },
      { repeat: 1 },
    ],
    [
      'codex',
      { command: 'git push origin my-branch' },
      'To github.com:vouchington/vouchington.git\n   abc123..def456  my-branch -> my-branch\n',
      { repeat: 1 },
    ],
  ])('stays silent for %s %j', (runtime, toolInput, toolResponse, { repeat }) => {
    const input = JSON.stringify({
      session_id: `e2e-post-tool-use-command-${randomUUID()}`,
      tool_input: toolInput,
      tool_response: toolResponse,
    })
    for (let attempt = 0; attempt < repeat; attempt += 1) {
      const result = runScript({ args: [runtime], env: { TMUX_PANE: undefined }, input })
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe('')
    }
  })

  it('emits only the tmux reminder on stdout for a PR-create call', () => {
    const result = runScript({
      args: ['claude'],
      env: fakeTmuxBinding(),
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
    return runScript({
      args: ['claude'],
      env: fakeTmuxBinding(),
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

  // Agents write their own Blackboard journal entries (docs/development/agent-blackboard.md), so
  // no module this hook can load may reach the Blackboard writer. The scan follows static and
  // dynamic relative imports, because the hook loads every side effect lazily with `import()`.
  it('never reaches the Blackboard journal writer through its static or dynamic imports', () => {
    const writerDirs = ['blackboard', 'agent-session-id'].map(dir =>
      path.join(worktreeRoot, 'dev', dir, path.sep),
    )
    const pending = [scriptPath]
    const reachable = new Set<string>()
    for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
      if (reachable.has(file)) continue
      reachable.add(file)
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:from\s+|import\()\s*['"](\.[^'"]+)['"]/g)) {
        pending.push(path.resolve(path.dirname(file), match[1] as string))
      }
    }
    expect(reachable.size).toBeGreaterThan(3)
    expect([...reachable].filter(file => writerDirs.some(dir => file.startsWith(dir)))).toEqual([])
  })

  it('registers no hook command that appends journal entries in either config', () => {
    const claude = JSON.parse(
      readFileSync(path.join(worktreeRoot, '.claude/settings.json'), 'utf8'),
    )
    const claudeCommands = Object.values<{ hooks: { command: string }[] }[]>(claude.hooks).flatMap(
      groups => groups.flatMap(group => group.hooks.map(hook => hook.command)),
    )
    const codex = readFileSync(path.join(worktreeRoot, '.codex/config.toml'), 'utf8')
    const codexCommands = [...codex.matchAll(/^command = (.+)$/gm)].map(match => match[1] as string)
    expect(claudeCommands.length).toBeGreaterThan(0)
    expect(codexCommands.length).toBeGreaterThan(0)
    for (const command of [...claudeCommands, ...codexCommands]) {
      expect(command).not.toMatch(/journal/i)
    }
  })

  it('ships the merged entrypoint in both configs with an explicit runtime argv', () => {
    const codex = readFileSync(path.join(worktreeRoot, '.codex/config.toml'), 'utf8')
    const claude = readFileSync(path.join(worktreeRoot, '.claude/settings.json'), 'utf8')
    expect(codex).toContain('dev/codex-hooks/post-tool-use-command.mts" codex 2>/dev/null')
    expect(claude).toContain('dev/codex-hooks/post-tool-use-command.mts\\" claude 2>/dev/null')
  })
})
