import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

describe('scanTranscripts retention accounting', () => {
  let root: string

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('counts retained record bytes once when merging file results', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-scan-retention-'))
    const projectsDir = join(root, 'claude-projects', 'proj-a')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    const commands = Array.from({ length: 30 }, (_, index) => `echo ${index} ${'x'.repeat(50_000)}`)
    writeFileSync(
      join(projectsDir, 'large-session.jsonl'),
      `${commands.map(claudeEscalationLine).join('\n')}\n`,
    )

    const result = await scanTranscripts({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    const expectedBytes = result.claudeEscalations.reduce(
      (sum, record) => sum + Buffer.byteLength(JSON.stringify(record)),
      0,
    )
    expect(result.claudeEscalations).toHaveLength(commands.length)
    expect(result.rawRetention.retainedRawBytes).toBe(expectedBytes)
    expect(result.rawRetention.recordsDropped).toBe(0)
  })
})
