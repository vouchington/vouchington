import '@/test-helpers/i18n/mock-json-messages'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import meta, { MultipleAudiences } from '../oauth/consent-scope-sections.stories'

describe('OAuth consent audience story', () => {
  it('shows each requested server and nests sensitive permissions within its section', () => {
    const html = renderToStaticMarkup(createElement(meta.component, MultipleAudiences.args))
    expect(html).toContain('Your account')
    expect(html).toContain('Community moderation')
    expect(html).toContain('Brand tools')
    expect(html).toContain('topic-claims:read')
    expect(html).toContain('Sensitive permissions')
  })
})
