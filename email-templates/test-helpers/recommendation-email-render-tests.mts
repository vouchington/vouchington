/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import type { EmailRenderResultPromise } from '../types.mts'

const recommendationEmailShell = {
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
} as const

type RecommendationEmailShell = {
  unsubscribeUrl: string
  physicalAddress: string
}

type LocaleTextRow = readonly [uiLocale: string, firstFragment: string, ...moreFragments: string[]]

type RecommendationEmailRenderTests<TProps extends RecommendationEmailShell> = {
  render: (props: TProps) => EmailRenderResultPromise
  previewProps: TProps
  subject: string
  snapshotStem: string
  testModuleUrl: string
  includedCopy: {
    props: Omit<TProps, keyof RecommendationEmailShell>
    fragments: readonly [string, ...string[]]
  }
  omittedValues: {
    props: (uiLocale: string) => Omit<TProps, keyof RecommendationEmailShell>
    rows: readonly LocaleTextRow[]
  }
}

function withRecommendationEmailShell<TProps extends RecommendationEmailShell>(
  props: Omit<TProps, keyof RecommendationEmailShell>,
): TProps {
  const completed = {
    ...props,
    unsubscribeUrl: recommendationEmailShell.unsubscribeUrl,
    physicalAddress: recommendationEmailShell.physicalAddress,
  }
  return completed as TProps
}

export function registerRecommendationEmailRenderTests<TProps extends RecommendationEmailShell>(
  options: RecommendationEmailRenderTests<TProps>,
): void {
  const {
    render,
    previewProps,
    subject,
    snapshotStem,
    testModuleUrl,
    includedCopy,
    omittedValues,
  } = options

  test('renders the expected subject and snapshots', async () => {
    const result = await render(previewProps)

    expect(result.subject).toBe(subject)
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL(`__snapshots__/${snapshotStem}.html`, testModuleUrl)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL(`__snapshots__/${snapshotStem}.txt`, testModuleUrl)),
    )
  })

  test('includes the supplied copy in both formats', async () => {
    const result = await render(withRecommendationEmailShell(includedCopy.props))

    for (const fragment of includedCopy.fragments) {
      expect(result.html).toContain(fragment)
      expect(result.text).toContain(fragment)
    }
  })

  test('falls back to locale copy when optional values are omitted', async () => {
    for (const [uiLocale, ...textFragments] of omittedValues.rows) {
      const result = await render(withRecommendationEmailShell(omittedValues.props(uiLocale)))

      for (const fragment of textFragments) {
        expect(result.text).toContain(fragment)
      }
    }
  })
}
