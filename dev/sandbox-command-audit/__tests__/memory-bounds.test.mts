import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createClaudeRecordExtractor } from '../claude-extract.mts'
import { scanCodexFile } from '../codex-scan.mts'
import {
  appendBounded,
  emptyRawRetention,
  MAX_RETAINED_RAW_BYTES,
  MAX_RETAINED_RAW_TEXT_CHARS,
} from '../limits.mts'
import { formatMarkdown } from '../report.mts'

describe('sandbox command audit memory bounds', () => {
  let root: string | undefined

  afterEach(() => {
    if (root) rmSync(root, { force: true, recursive: true })
  })

  it('bounds pending Claude correlation and retained raw command text', () => {
    const extractor = createClaudeRecordExtractor()
    const command = `git status ${'x'.repeat(MAX_RETAINED_RAW_TEXT_CHARS + 1)}`
    for (let index = 0; index < 40; index++) {
      extractor.pushLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: `tool-${index}`, name: 'Bash', input: { command } }],
          },
        }),
      )
    }

    const result = extractor.result()
    expect(result.escalations).toEqual([])
    expect(result.rawRetention).toMatchObject({
      commandTextsTruncated: 40,
      pendingToolUsesDropped: expect.any(Number),
      pendingToolUseBytesDropped: expect.any(Number),
    })
    expect(result.rawRetention.pendingToolUsesDropped).toBeGreaterThan(0)
    expect(result.rawRetention.pendingToolUseBytesDropped).toBeGreaterThan(0)
  })

  it('shares one 2 MiB budget across retained raw arrays', () => {
    const retention = emptyRawRetention()
    const records: string[] = []
    for (let index = 0; index < 40; index++) {
      appendBounded(records, 'x'.repeat(MAX_RETAINED_RAW_TEXT_CHARS), retention)
    }

    expect(retention.retainedRawBytes).toBeLessThanOrEqual(MAX_RETAINED_RAW_BYTES)
    expect(retention.recordsDropped).toBeGreaterThan(0)
    expect(retention.rawBytesDropped).toBeGreaterThan(0)
  })

  it('drops one pending correlation that cannot fit the byte budget', () => {
    const extractor = createClaudeRecordExtractor()
    extractor.pushLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'x'.repeat(2 * 1024 * 1024),
              name: 'Bash',
              input: { command: 'git status' },
            },
          ],
        },
      }),
    )

    expect(extractor.result().rawRetention).toMatchObject({
      pendingToolUsesDropped: 1,
      pendingToolUseBytesDropped: expect.any(Number),
    })
  })

  it('cleans an oversized inherited Codex spool after reporting its cap', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-memory-'))
    const tempRoot = join(root, 'spools')
    mkdirSync(tempRoot)
    const transcript = join(root, 'child.jsonl')
    const timestamp = '2026-07-13T10:00:00.900Z'
    const oversizedRecord = JSON.stringify({
      type: 'event_msg',
      payload: { output: 'x'.repeat(1500) },
    })
    writeFileSync(
      transcript,
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'child', session_id: 'parent', timestamp, parent_thread_id: 'parent' },
      })}\n${oversizedRecord}\n${oversizedRecord}\n`,
    )

    await expect(scanCodexFile(transcript, tempRoot, { spoolLimitBytes: 1024 })).resolves.toEqual({
      error: 'inherited Codex spool exceeds 1024 byte limit',
    })
    expect(readdirSync(tempRoot)).toEqual([])
  })

  it('reports raw-retention truncation in default output', () => {
    const report = formatMarkdown({
      genuineBypassCandidates: [],
      genuineBypassUnresolvedCount: 0,
      blockCandidates: [],
      blockCandidateUnresolvedCount: 0,
      escalationPressure: {
        claudeCovered: [],
        claudeUncovered: [],
        claudeUnresolvedCount: 0,
        e2bigCount: 0,
      },
      policyBlockCount: 0,
      worktreeDenialCount: 0,
      claudeFilesScanned: 0,
      codexFilesScanned: 0,
      readErrorCount: 0,
      repoRoots: [],
      skippedOtherRepo: { claude: 0, codex: 0 },
      skippedUnknownCwd: { claude: 0, codex: 0 },
      rawRetention: {
        commandTextsTruncated: 1,
        errorTextsTruncated: 2,
        pendingToolUsesDropped: 3,
        pendingToolUseBytesDropped: 4,
        recordsDropped: 4,
        rawBytesDropped: 5,
        retainedRawBytes: 6,
      },
    })

    expect(report).toContain(
      'Raw retention bounded: 1 command text(s), 2 error text(s), 3 pending tool use(s), 4 record(s) truncated or dropped',
    )
  })
})
