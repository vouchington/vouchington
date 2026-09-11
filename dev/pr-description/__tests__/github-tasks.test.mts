import { describe, expect, it } from 'vitest'

import { hasUncheckedGitHubTask } from '../github-tasks.mts'

describe('hasUncheckedGitHubTask', () => {
  it.each([
    ['no checklist', 'Just prose', false],
    ['checked task', '- [x] done', false],
    ['uppercase checked task', '- [X] done', false],
    ['unchecked task', '- [ ] remaining', true],
    ['mixed tasks', '- [x] done\n- [ ] remaining', true],
    ['nested task', '  1. [ ] remaining', true],
    ['blockquoted task', '> - [ ] remaining', true],
    ['fenced lookalike', '```md\n- [ ] example\n```', false],
    ['longer closing fence', '```md\n- [ ] example\n````\n- [ ] remaining', true],
    ['indented code', '    - [ ] example', false],
    ['nested four-space task', '- parent\n    - [ ] remaining', true],
    [
      'nested task after continuation prose',
      '- parent\n\n  continuation prose\n\n  - [ ] remaining',
      true,
    ],
    ['commented lookalike', '<!-- - [ ] hidden -->', false],
    ['unclosed comment', '<!-- hidden\n- [ ] hidden too', false],
    ['blockquoted fenced lookalike', '> ```md\n> - [ ] example\n> ```', false],
    [
      'outside task after unclosed blockquoted fence',
      '> ```md\n> - [ ] example\n\n- [ ] remaining',
      true,
    ],
    ['blockquoted indented code', '>     - [ ] example', false],
    ['preformatted HTML literal', '<pre>\n- [ ] example\n</pre>', false],
    ['prose lookalike', 'The text [ ] is not a task.', false],
  ])('detects %s', (_name, markdown, expected) => {
    expect(hasUncheckedGitHubTask(markdown)).toBe(expected)
  })
})
