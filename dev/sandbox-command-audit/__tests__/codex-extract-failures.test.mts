import { describe, expect, it } from 'vitest'

import { extractCodexRecords } from '../codex-extract.mts'

function line(record: unknown): string {
  return JSON.stringify(record)
}

function nestedExecCall(callId: string, command: string): string {
  return line({
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      name: 'exec',
      call_id: callId,
      input: `const r = await tools.exec_command({cmd:${JSON.stringify(command)}}); text(r.output)`,
    },
  })
}

function nestedExecOutput(callId: string, text: string): string {
  return line({
    type: 'response_item',
    payload: {
      type: 'custom_tool_call_output',
      call_id: callId,
      output: [{ type: 'input_text', text }],
    },
  })
}

function commandExecution(options: {
  command?: unknown
  parsedCommand?: string
  aggregatedOutput?: string
  stdout?: string
  stderr?: string
  exitCode: number
}): string {
  return line({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        command: options.command,
        parsed_cmd: options.parsedCommand
          ? [{ type: 'unknown', cmd: options.parsedCommand }]
          : undefined,
        aggregated_output: options.aggregatedOutput,
        stdout: options.stdout,
        stderr: options.stderr,
        exit_code: options.exitCode,
        status: options.exitCode === 0 ? 'completed' : 'failed',
      },
    },
  })
}

describe('extractCodexRecords — normalized sandbox failures', () => {
  it('extracts a branch reflog denial from a realistic nested execution sequence', () => {
    const command = 'git branch -m agent/new-name'
    const errorText =
      'error: unable to move logfile logs/refs/heads/agent/old-name to logs/refs/heads/agent/new-name: Operation not permitted\nfatal: branch rename failed'
    const result = extractCodexRecords([
      nestedExecCall('call-branch', command),
      commandExecution({
        command: ['/bin/zsh', '-lc', command],
        aggregatedOutput: errorText,
        exitCode: 128,
      }),
      nestedExecOutput('call-branch', `Script failed\nOutput:\n${errorText}`),
    ])

    expect(result.sandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command, errorText },
    ])
  })

  it('extracts an exit-zero push followed by local config and tracking-ref denials', () => {
    const command = 'git push -u origin agent/topic'
    const errorText =
      "To github.com:vouchington/vouchington.git\n * [new branch] agent/topic -> agent/topic\nerror: could not lock config file /repo/.git/config: Operation not permitted\nerror: update_ref failed for ref 'refs/remotes/origin/agent/topic': cannot lock ref 'refs/remotes/origin/agent/topic': Unable to create '/repo/.git/refs/remotes/origin/agent/topic.lock': Operation not permitted"
    const result = extractCodexRecords([
      nestedExecCall('call-push', command),
      commandExecution({ command, aggregatedOutput: errorText, exitCode: 0 }),
      nestedExecOutput('call-push', `Script completed\nOutput:\n${errorText}`),
    ])

    expect(result.sandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command, errorText },
    ])
  })

  it('ignores ordinary Git lock contention without a permission token', () => {
    const result = extractCodexRecords([
      commandExecution({
        command: ['/bin/zsh', '-lc', 'git commit -m test'],
        aggregatedOutput:
          "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': File exists. Another git process seems to be running",
        exitCode: 128,
      }),
    ])

    expect(result.sandboxFailures).toEqual([])
  })

  it('ignores unrelated permission failures and denial-looking outer envelopes', () => {
    const result = extractCodexRecords([
      commandExecution({
        command: ['/bin/zsh', '-lc', 'ps aux'],
        aggregatedOutput: 'zsh: operation not permitted: ps',
        exitCode: 1,
      }),
      nestedExecCall('call-safe', 'echo safe'),
      commandExecution({ command: 'echo safe', aggregatedOutput: 'safe', exitCode: 0 }),
      nestedExecOutput(
        'call-safe',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Operation not permitted",
      ),
    ])

    expect(result.sandboxFailures).toEqual([])
  })

  it('uses parsed command and stdout/stderr fallbacks for normalized events', () => {
    const errorText =
      "fatal: Unable to create '/repo/.git/worktrees/x/FETCH_HEAD': Permission denied"
    const result = extractCodexRecords([
      commandExecution({
        command: { unrecognized: true },
        parsedCommand: 'git fetch origin',
        stdout: '',
        stderr: errorText,
        exitCode: 1,
      }),
    ])

    expect(result.sandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command: 'git fetch origin', errorText },
    ])
  })

  it('extracts an env-wrapped rebase denial against a read-only worktree lock', () => {
    const command = 'env GIT_EDITOR=true git rebase --continue'
    const errorText =
      "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Read-only file system"
    const result = extractCodexRecords([
      commandExecution({ command, aggregatedOutput: errorText, exitCode: 128 }),
    ])

    expect(result.sandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command, errorText },
    ])
  })

  it('extracts a notes-ref lock denial and ignores displayed denial-shaped content', () => {
    const notesCommand = 'git notes add -m note'
    const notesError =
      "fatal: Unable to create '/repo/.git/refs/notes/commits.lock': Permission denied"
    const result = extractCodexRecords([
      commandExecution({
        command: notesCommand,
        aggregatedOutput: notesError,
        exitCode: 128,
      }),
      commandExecution({
        command: 'git show HEAD:fixtures/denial.txt',
        aggregatedOutput: '/repo/.git/worktrees/x/index.lock: Permission denied',
        exitCode: 0,
      }),
    ])

    expect(result.sandboxFailures).toEqual([
      {
        source: 'codex',
        kind: 'worktree-denial',
        command: notesCommand,
        errorText: notesError,
      },
    ])
  })

  it('selects the last string from an array command with trailing metadata', () => {
    const command = 'git fetch origin'
    const errorText =
      "fatal: Unable to create '/repo/.git/worktrees/x/FETCH_HEAD': Permission denied"
    const result = extractCodexRecords([
      commandExecution({
        command: ['/bin/zsh', '-lc', command, { metadata: true }],
        aggregatedOutput: errorText,
        exitCode: 1,
      }),
    ])

    expect(result.sandboxFailures).toEqual([
      { source: 'codex', kind: 'worktree-denial', command, errorText },
    ])
  })
})
