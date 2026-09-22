import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = { jobs?: Record<string, { steps?: Array<{ run?: string }> }> }

const parsed = load(readFileSync('.github/workflows/fix-main-self-retry.yml', 'utf8')) as Workflow
const escalationScript = parsed.jobs?.['escalate-retry-failure']?.steps?.[0]?.run
const expectedBody = `## Fix Main failure handling could not be confirmed

The watcher could not confirm any safe terminal outcome for the Fix Main failure (attempt 2):
the original run did not have a confirmed human escalation, the source was not confirmed
superseded, and no rerun request was confirmed accepted.

**Fix Main run:** https://github.test/fix-main/1234
**Watcher run (logs/artifact):** https://github.test/vouchington/vouchington/actions/runs/777

Please inspect the Fix Main run above and apply a fix manually.`

describe('Fix Main self-retry fallback shell', () => {
  it.each([
    {
      existingIssue: '',
      command: 'issue create',
      expectedArgs: [
        '--repo',
        'vouchington/vouchington',
        '--title',
        'Fix Main self-retry incomplete: run 1234 — needs human',
        '--body',
        expectedBody,
        '--label',
        'automation',
        '--label',
        'needs-human',
      ],
    },
    {
      existingIssue: '88',
      command: 'issue comment',
      expectedArgs: ['88', '--repo', 'vouchington/vouchington', '--body', expectedBody],
    },
  ])('uses a factual body for $command', ({ existingIssue, command, expectedArgs }) => {
    const invocation = runEscalation(existingIssue)
    expect(invocation.command).toBe(command)
    expect(invocation.body).toBe(expectedBody)
    expect(invocation.args).toEqual(expectedArgs)
  })
})

function runEscalation(existingIssue: string) {
  const directory = mkdtempSync(join(tmpdir(), 'fix-main-escalation-'))
  const fakeGh = join(directory, 'gh')
  const commandFile = join(directory, 'command')
  const argumentsFile = join(directory, 'arguments')
  writeFileSync(
    fakeGh,
    `#!/bin/bash
set -euo pipefail
command="$1 $2"
shift 2
if [[ "$command" == "issue list" ]]; then
  printf '%s\\n' "\${FAKE_EXISTING_ISSUE:-}"
  exit 0
fi
printf '%s' "$command" > "$FAKE_GH_COMMAND_FILE"
printf '%s\\0' "$@" > "$FAKE_GH_ARGUMENTS_FILE"
`,
  )
  chmodSync(fakeGh, 0o755)

  const script = (escalationScript ?? 'exit 99')
    .replaceAll('${{ github.server_url }}', 'https://github.test')
    .replaceAll('${{ github.repository }}', 'vouchington/vouchington')
    .replaceAll('${{ github.run_id }}', '777')
  try {
    const result = spawnSync('/bin/bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        GITHUB_REPOSITORY: 'vouchington/vouchington',
        FIX_MAIN_RUN_ID: '1234',
        FIX_MAIN_RUN_URL: 'https://github.test/fix-main/1234',
        FIX_MAIN_RUN_ATTEMPT: '2',
        FAKE_EXISTING_ISSUE: existingIssue,
        FAKE_GH_COMMAND_FILE: commandFile,
        FAKE_GH_ARGUMENTS_FILE: argumentsFile,
      },
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const args = readFileSync(argumentsFile).toString().split('\0').filter(Boolean)
    return {
      command: readFileSync(commandFile, 'utf8'),
      args,
      body: args[args.indexOf('--body') + 1] ?? '',
    }
  } finally {
    rmSync(directory, { recursive: true })
  }
}
