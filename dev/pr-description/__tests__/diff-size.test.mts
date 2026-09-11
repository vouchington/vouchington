import { describe, expect, it } from 'vitest'

import {
  countChangedDiffLines,
  formatLargeDiffRefusal,
  LARGE_DIFF_LINE_THRESHOLD,
} from '../diff-size.mts'

describe('countChangedDiffLines', () => {
  it('returns 0 for an empty diff', () => {
    expect(countChangedDiffLines('')).toBe(0)
  })

  it('counts both added and removed lines', () => {
    const diff = [
      'diff --git a/x.txt b/x.txt',
      '+++ b/x.txt',
      '--- a/x.txt',
      '+added',
      '-removed',
    ].join('\n')
    expect(countChangedDiffLines(diff)).toBe(2)
  })

  it('excludes the +++/--- file-header lines', () => {
    const diff = ['--- a/x.txt', '+++ b/x.txt', '+one', '+two'].join('\n')
    expect(countChangedDiffLines(diff)).toBe(2)
  })

  it('counts a diff with only additions', () => {
    const diff = ['+++ b/x.txt', '+one', '+two', '+three'].join('\n')
    expect(countChangedDiffLines(diff)).toBe(3)
  })

  it('counts a diff with only deletions', () => {
    const diff = ['--- a/x.txt', '-one', '-two'].join('\n')
    expect(countChangedDiffLines(diff)).toBe(2)
  })

  it('excludes any line starting with the literal +++/--- prefix, even real content', () => {
    // countChangedDiffLines matches the literal '+++'/'---' prefix, not "is this actually a file
    // header." A content line that happens to start that way — e.g. an added line whose text
    // begins "++" renders as '+++...' once the diff marker is prepended — is excluded too, same as
    // a real header. See the known-limitation note on countChangedDiffLines: this can undercount.
    const diff = ['+++ b/x.txt', '--- a/x.txt', '+++not a header, just content'].join('\n')
    expect(countChangedDiffLines(diff)).toBe(0)
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
    expect(countChangedDiffLines(diff)).toBe(2)
  })
})

describe('formatLargeDiffRefusal', () => {
  it('names the changed-line count, the threshold, and the override flag', () => {
    const message = formatLargeDiffRefusal(6000)
    expect(message).toContain('6000')
    expect(message).toContain(String(LARGE_DIFF_LINE_THRESHOLD))
    expect(message).toContain('--acknowledge-large-diff')
  })

  it('points at the split-vs-stack decision and the stacked-prs skill', () => {
    const message = formatLargeDiffRefusal(5001)
    expect(message).toContain('.agents/skills/agent-workflow/git-and-prs.md')
    expect(message).toContain('.agents/skills/stacked-prs/SKILL.md')
  })
})
