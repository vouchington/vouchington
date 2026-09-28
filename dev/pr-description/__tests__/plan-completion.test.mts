import { describe, expect, it } from 'vitest'

import { assessPlanCompletion } from '../plan-completion.mts'

describe('plan completion advisory policy', () => {
  it('warns only for one open non-closing sibling after a merged sibling', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
          {
            body: '## Related issues\nPart of vouchington/vouchington#726',
            number: 2,
            state: 'open',
          },
        ],
      }),
    ).toMatchObject({ kind: 'stranded-sibling', sibling: 2 })
  })

  it('does not warn when an open sibling closes the Plan', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
          { body: '## Related issues\nCloses #726', number: 2, state: 'open' },
        ],
      }),
    ).toEqual({ kind: 'none' })
  })

  it('recognizes a closing sibling after collapsed supporting headings', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
          {
            body: '## Related issues\n\n<details>\n<summary>Context</summary>\n\n## Background\n\nSupporting context.\n\n</details>\n\nCloses #726',
            number: 2,
            state: 'open',
          },
        ],
      }),
    ).toEqual({ kind: 'none' })
  })

  it.each([
    '```md\n## Example\nCloses #726\n```',
    '<!--\n## Example\nCloses #726\n-->',
    '<div>\n## Example\nCloses #726\n</div>',
    '```md\n## Example\n```\n\n<!-- Closes #726 -->',
  ])('does not treat example closing references as a completing sibling: %s', example => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
          { body: `## Related issues\n\n${example}\n\nRefs #726`, number: 2, state: 'open' },
        ],
      }),
    ).toEqual({ kind: 'stranded-sibling', sibling: 2 })
  })

  it.each(['Closes #726 — fixes `foo`', 'Closes #726 <!-- explanation\ncontinued -->'])(
    'recognizes a visible closing reference beside excluded content: %s',
    reference => {
      expect(
        assessPlanCompletion({
          number: 726,
          repository: 'vouchington/vouchington',
          pullRequests: [
            { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
            { body: `## Related issues\n\n${reference}`, number: 2, state: 'open' },
          ],
        }),
      ).toEqual({ kind: 'none' })
    },
  )

  it('does not warn without a merged sibling or with more than one open sibling', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [{ body: '## Related issues\nRefs #726', number: 1, state: 'open' }],
      }),
    ).toEqual({ kind: 'none' })
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
          { body: '## Related issues\nRefs #726', number: 2, state: 'open' },
          { body: '## Related issues\nPart of #726', number: 3, state: 'open' },
        ],
      }),
    ).toEqual({ kind: 'none' })
  })

  it('ignores cross-repository references and refs outside Related issues', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          {
            body: '## Related issues\nRefs other/repo#726',
            merged: true,
            number: 1,
            state: 'closed',
          },
          { body: 'Refs #726', number: 2, state: 'open' },
        ],
      }),
    ).toEqual({ kind: 'none' })
  })

  it('reminds readers to audit an open Plan with no open siblings', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'vouchington/vouchington',
        pullRequests: [
          { body: '## Related issues\nRefs #726', merged: true, number: 1, state: 'closed' },
        ],
      }),
    ).toEqual({ kind: 'unopened-work' })
  })

  it('normalizes self-qualified Plan references', () => {
    expect(
      assessPlanCompletion({
        number: 726,
        repository: 'Vouchington/Vouchington',
        pullRequests: [
          {
            body: '## Related issues\nRefs vouchington/vouchington#726',
            merged: true,
            number: 1,
            state: 'closed',
          },
          { body: '## Related issues\nRefs #726', number: 2, state: 'open' },
        ],
      }),
    ).toMatchObject({ kind: 'stranded-sibling', sibling: 2 })
  })
})
