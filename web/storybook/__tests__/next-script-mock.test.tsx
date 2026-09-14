import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { storybookMockResolveAliases } from '../../../test-helpers/vitest-config/storybook-browser-aliases.mts'
import { buildStorybookAliases } from '../../.storybook/vite-config-helpers'
import Script from '../mocks/next-script'

describe('next/script Storybook mock', () => {
  it('does not request production-only runtime scripts', () => {
    const html = renderToStaticMarkup(
      <Script
        id='runtime-public-config-init'
        src='/runtime-sentry-config.js'
      />,
    )

    expect(html).toBe('')
  })

  it('replaces next/script in published and browser-mode Storybook', () => {
    const expectedAlias = {
      find: 'next/script',
      replacement: expect.stringMatching(/[\\/]next-script\.tsx$/),
    }

    expect(buildStorybookAliases([])).toEqual(expect.arrayContaining([expectedAlias]))
    expect(storybookMockResolveAliases).toEqual(expect.arrayContaining([expectedAlias]))
  })
})
