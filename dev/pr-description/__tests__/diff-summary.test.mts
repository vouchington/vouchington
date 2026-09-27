import { describe, expect, it } from 'vitest'

import { createDiffSummary, reduceDiffBlock } from '../diff-summary.mts'

describe('reduceDiffBlock', () => {
  it('accumulates line changes and removal metadata without retaining prior blocks', () => {
    const summary = createDiffSummary()
    reduceDiffBlock(
      summary,
      [
        'diff --git a/retired.mts b/retired.mts',
        'deleted file mode 100644',
        '--- a/retired.mts',
        '+++ /dev/null',
        '-export const retired = true',
      ].join('\n'),
    )
    reduceDiffBlock(
      summary,
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '-  "old": "command",',
      ].join('\n'),
    )

    expect(summary.lineChanges).toEqual({ added: 0, deleted: 2 })
    expect(summary.removedSurfaces).toEqual([{ path: 'retired.mts', type: 'deleted-file' }])
    expect(summary.changedPackageJsonPaths).toEqual(['package.json'])
  })

  it('does not duplicate a changed package manifest when a source repeats a block', () => {
    const summary = createDiffSummary()
    const block = ['diff --git a/package.json b/package.json', '+++ b/package.json'].join('\n')
    reduceDiffBlock(summary, block)
    reduceDiffBlock(summary, block)
    expect(summary.changedPackageJsonPaths).toEqual(['package.json'])
  })

  it('keeps CRLF removal paths equivalent to LF paths', () => {
    const lf = createDiffSummary()
    const crlf = createDiffSummary()
    const lines = ['diff --git a/old.mts b/old.mts', 'deleted file mode 100644']
    reduceDiffBlock(lf, lines.join('\n'))
    reduceDiffBlock(crlf, lines.join('\r\n'))
    expect(crlf.removedSurfaces).toEqual(lf.removedSurfaces)
  })
})
