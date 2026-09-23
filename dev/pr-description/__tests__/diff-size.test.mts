import { describe, expect, it } from 'vitest'

import {
  countDiffLineChanges,
  exceedsLargeDiffThreshold,
  formatLargeDiffRefusal,
  LARGE_DIFF_ADDED_LINE_THRESHOLD,
  LARGE_DIFF_DELETED_LINE_THRESHOLD,
} from '../diff-size.mts'

describe('countDiffLineChanges', () => {
  it('returns 0 for an empty diff', () => {
    expect(countDiffLineChanges('')).toEqual({ added: 0, deleted: 0 })
  })

  it('counts both added and removed lines', () => {
    const diff = [
      'diff --git a/x.txt b/x.txt',
      '+++ b/x.txt',
      '--- a/x.txt',
      '+added',
      '-removed',
    ].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 1, deleted: 1 })
  })

  it('excludes the +++/--- file-header lines', () => {
    const diff = ['--- a/x.txt', '+++ b/x.txt', '+one', '+two'].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 2, deleted: 0 })
  })

  it('counts a diff with only additions', () => {
    const diff = ['+++ b/x.txt', '+one', '+two', '+three'].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 3, deleted: 0 })
  })

  it('counts a diff with only deletions', () => {
    const diff = ['--- a/x.txt', '-one', '-two'].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 0, deleted: 2 })
  })

  it('excludes any line starting with the literal +++/--- prefix, even real content', () => {
    // countChangedDiffLines matches the literal '+++'/'---' prefix, not "is this actually a file
    // header." A content line that happens to start that way — e.g. an added line whose text
    // begins "++" renders as '+++...' once the diff marker is prepended — is excluded too, same as
    // a real header. See the known-limitation note on countDiffLineChanges: this can undercount.
    const diff = ['+++ b/x.txt', '--- a/x.txt', '+++not a header, just content'].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 0, deleted: 0 })
  })

  it('ignores context lines and diff metadata', () => {
    const diff = [
      'diff --git a/x.txt b/x.txt',
      'index abc123..def456 100644',
      '@@ -1,3 +1,3 @@',
      ' unchanged context line',
      '+added',
      '-removed',
    ].join('\n')
    expect(countDiffLineChanges(diff)).toEqual({ added: 1, deleted: 1 })
  })
})

describe('exceedsLargeDiffThreshold', () => {
  it('keeps the addition limit at 5000 lines', () => {
    expect(exceedsLargeDiffThreshold({ added: LARGE_DIFF_ADDED_LINE_THRESHOLD, deleted: 0 })).toBe(
      false,
    )
    expect(
      exceedsLargeDiffThreshold({ added: LARGE_DIFF_ADDED_LINE_THRESHOLD + 1, deleted: 0 }),
    ).toBe(true)
  })

  it('allows a larger deletion-only retirement before requiring acknowledgement', () => {
    expect(
      exceedsLargeDiffThreshold({ added: 0, deleted: LARGE_DIFF_DELETED_LINE_THRESHOLD }),
    ).toBe(false)
    expect(
      exceedsLargeDiffThreshold({ added: 0, deleted: LARGE_DIFF_DELETED_LINE_THRESHOLD + 1 }),
    ).toBe(true)
  })
})

describe('formatLargeDiffRefusal', () => {
  it('names the changed-line count, the threshold, and the override flag', () => {
    const message = formatLargeDiffRefusal({ added: 6000, deleted: 10 })
    expect(message).toContain('6000')
    expect(message).toContain(String(LARGE_DIFF_ADDED_LINE_THRESHOLD))
    expect(message).toContain(String(LARGE_DIFF_DELETED_LINE_THRESHOLD))
    expect(message).toContain('--acknowledge-large-diff')
  })

  it('points at the split-vs-stack decision and the stacked-prs skill', () => {
    const message = formatLargeDiffRefusal({ added: 5001, deleted: 0 })
    expect(message).toContain('.agents/skills/agent-workflow/git-and-prs.md')
    expect(message).toContain('.agents/skills/stacked-prs/SKILL.md')
  })
})
