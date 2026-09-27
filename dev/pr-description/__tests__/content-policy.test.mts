import { describe, expect, it } from 'vitest'

import {
  VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
  VALID_PR_BODY,
} from '../../test-helpers/pr-description/valid-pr-body.mts'
import { extractFixMainInterimClassifierRootCauseRef } from '../scheduled-no-source.mts'
import { validatePrBody } from '../validate.mts'

function withCore(core: string): string {
  return `${core}\n\n${VALID_PR_BODY.slice(VALID_PR_BODY.indexOf('## Related issues'))}`
}

describe('PR description content policy', () => {
  it('accepts concise outcomes without a Test plan or Harness gaps section', () => {
    expect(validatePrBody(VALID_PR_BODY).ok).toBe(true)
  })

  it.each(['Summary', 'Impact'])('requires a visible %s heading', heading => {
    const body = VALID_PR_BODY.replace(`## ${heading}`, `## Other ${heading}`)
    expect(validatePrBody(body).ok).toBe(false)
  })

  it.each(['Summary', 'Impact'])('rejects duplicate %s sections', heading => {
    expect(validatePrBody(`${VALID_PR_BODY}\n## ${heading}\n\nAnother outcome.`).ok).toBe(false)
  })

  it.each([
    '',
    '<!-- A hidden explanation. -->',
    '```text\nAn example, not the explanation.\n```',
    '<details>\n<summary>Impact evidence</summary>\n\nOnly collapsed content.\n\n</details>',
  ])('rejects Impact without visible content: %s', content => {
    const body = withCore(`## Summary\n\nFix the omitted preflight.\n\n## Impact\n\n${content}`)
    expect(validatePrBody(body).ok).toBe(false)
  })

  it.each([
    '<!--\n## Impact\n\nHidden in a comment.\n-->',
    '```markdown\n## Impact\n\nHidden in an example.\n```',
    '<details>\n<summary>Supplement</summary>\n\n## Impact\n\nHidden in details.\n\n</details>',
  ])('does not count hidden or example headings: %s', hidden => {
    expect(validatePrBody(withCore(`## Summary\n\nCorrect the preflight.\n\n${hidden}`)).ok).toBe(
      false,
    )
  })

  it('accepts visible lists and tables with collapsed supporting headings', () => {
    const body = withCore(`## Summary

- Validate descriptions before publishing them.

<details>
<summary>Design evidence</summary>

## Impact

This supplemental heading must not count as another core section.

</details>

## Impact

| Audience | Before | After |
| --- | --- | --- |
| Reviewers | Impact was implicit | Impact is stated |
`)
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('does not end Related issues at a heading inside collapsed evidence', () => {
    const body = VALID_PR_BODY.replace(
      'Closes #123',
      '<details>\n<summary>Context</summary>\n\n## Background\n\nDesign context.\n\n</details>\n\nCloses #123',
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('accepts the scheduled representation after collapsed supporting headings', () => {
    const body = VALID_PR_BODY.replace(
      'Closes #123',
      '<details>\n<summary>Context</summary>\n\n## Background\n\nSupporting context.\n\n</details>\n\nNo source issue; scheduled prompt run.\n<!-- related-issues-validation: no-source-scheduled-prompt -->',
    ).replace(
      'Workspace setup: ./dev/initialize monorepo',
      'Workspace setup: Auto Harness scheduled prompt',
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('accepts and resolves the Fix Main representation after collapsed supporting headings', () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(
      'Refs #456',
      '<details>\n<summary>Context</summary>\n\n## Background\n\nSupporting context.\n\n</details>\n\nRefs #456',
    )
    expect(validatePrBody(body).ok).toBe(true)
    expect(extractFixMainInterimClassifierRootCauseRef(body)?.number).toBe(456)
  })

  it('retains case-insensitive Related issues headings', () => {
    expect(validatePrBody(VALID_PR_BODY.replace('## Related issues', '## related ISSUES')).ok).toBe(
      true,
    )
  })

  it('rejects an empty Related issues section', () => {
    const body = `${VALID_PR_BODY.replace('## Related issues', '## References')}\n## Related issues\n`
    expect(validatePrBody(body).ok).toBe(false)
  })

  it('rejects a Related issues heading supplied only in a code example', () => {
    const body = `${VALID_PR_BODY.replace('## Related issues', '## References')}\n\n\`\`\`markdown\n## Related issues\n\nCloses #123\n\`\`\``
    expect(validatePrBody(body).ok).toBe(false)
  })

  it('rejects an unclosed details container', () => {
    expect(validatePrBody(`${VALID_PR_BODY}\n<details>\n<summary>Evidence</summary>\n`).ok).toBe(
      false,
    )
  })
})
