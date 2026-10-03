import { describe, expect, it } from 'vitest'

import { checkPlaywrightVisibilityFallback } from './playwright-visibility-fallback-guard.mts'

const spec = 'playwright/tests/admin/example.spec.mts'

function violations(source: string, file = spec): string[] {
  const errors: string[] = []
  checkPlaywrightVisibilityFallback('', [file], errors, () => source)
  return errors
}

describe('Playwright visibility fallback guard', () => {
  it('reports each swallowed visibility failure at its call line', () => {
    const errors = violations(
      [
        'const first = await row.isVisible().catch(() => false)',
        'const second = await page',
        '  .getByTestId("empty-state")',
        '  .isVisible()',
        '  .catch(() => false)',
      ].join('\n'),
    )

    expect(errors).toEqual([
      `::error file=${spec},line=1::Do not swallow Playwright isVisible() failures with .catch(() => false); seed the expected state and assert the observable result`,
      `::error file=${spec},line=4::Do not swallow Playwright isVisible() failures with .catch(() => false); seed the expected state and assert the observable result`,
    ])
  })

  it('allows ordinary visibility checks and unrelated failure handling', () => {
    expect(
      violations(
        [
          'expect(await row.isVisible()).toBe(true)',
          'await expect(row).toBeVisible()',
          'const loaded = await row.isVisible().catch(error => { throw error })',
          'await page.close().catch(() => false)',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('reads only tracked Playwright specs, excluding helpers and other tests', () => {
    const errors: string[] = []
    const read: string[] = []
    checkPlaywrightVisibilityFallback(
      '',
      [
        spec,
        'playwright/helpers/example.mts',
        'playwright/tests/admin/example.test.mts',
        'web/example.spec.mts',
      ],
      errors,
      file => {
        read.push(file)
        return 'const visible = await row.isVisible().catch(() => false)'
      },
    )

    expect(read).toEqual([spec])
    expect(errors).toHaveLength(1)
  })
})
