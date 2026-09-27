import { describe, expect, it } from 'vitest'
import { collectDiffSummary } from '../stream-diff-summary.mts'

describe('collectDiffSummary', () => {
  it('reduces a real single-file diff larger than one MiB', async () => {
    const summary = await collectDiffSummary({
      executable: process.execPath,
      args: [
        '-e',
        "process.stdout.write('diff --git a/large.mts b/large.mts\\n+');process.stdout.write('x'.repeat(1_100_000));process.stdout.write('\\n')",
      ],
    })
    expect(summary.lineChanges).toEqual({ added: 1, deleted: 0 })
  })

  it('preserves Unicode, CRLF paths, and a final unterminated block', async () => {
    const text =
      'diff --git a/old-€.mts b/old-€.mts\r\ndeleted file mode 100644\r\ndiff --git a/x b/x\r\n+€'
    const summary = await collectDiffSummary({
      executable: process.execPath,
      args: ['-e', `process.stdout.write(${JSON.stringify(text)})`],
    })
    expect(summary.lineChanges).toEqual({ added: 1, deleted: 0 })
    expect(summary.removedSurfaces).toEqual([{ path: 'old-€.mts', type: 'deleted-file' }])
  })
})
