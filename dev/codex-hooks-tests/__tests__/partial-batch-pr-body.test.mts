import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

const DECLARATION = `Refs #123
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`

describe('partial batch PR body hook policy', () => {
  let directory: string
  let bodyFile: string
  beforeEach(() => {
    directory = makeTestTempDirSync('partial-batch-hook-')
    bodyFile = join(directory, 'body.md')
  })
  afterEach(() => rmSync(directory, { force: true, recursive: true }))
  it.each(['create --draft', 'edit 17'])('allows an explicit partial batch for %s', action => {
    writeFileSync(bodyFile, `## Related issues\n\n${DECLARATION}`)
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh pr ${action} --body-file ${bodyFile}`,
        },
      }),
    ).toBeNull()
  })
  it.each([
    DECLARATION.replace('Refs #123\n', ''),
    DECLARATION.replace('Refs #123', '`Refs #123`'),
    DECLARATION.replace('Refs #123', '    Refs #123'),
    DECLARATION.replace('Refs #123', 'Refs #9007199254740992'),
    `~~~md\n${DECLARATION}\n~~~`,
    `<!--\n${DECLARATION}\n-->`,
    `<pre>\n${DECLARATION}\n</pre>`,
  ])('blocks malformed or hidden declarations %s', declaration => {
    writeFileSync(bodyFile, `## Related issues\n\n${declaration}`)
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh pr edit 17 --body-file ${bodyFile}`,
        },
      })?.reason,
    ).toContain('closing keyword')
  })
  it('keeps draft-first enforcement', () => {
    writeFileSync(bodyFile, `## Related issues\n\n${DECLARATION}`)
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: `gh pr create --body-file ${bodyFile}`,
        },
      })?.reason,
    ).toContain('draft')
  })
})
