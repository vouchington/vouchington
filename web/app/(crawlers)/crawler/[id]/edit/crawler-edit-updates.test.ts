import { describe, expect, it } from 'vitest'
import { buildCrawlerUpdates } from './crawler-edit-updates'

describe('buildCrawlerUpdates', () => {
  it('splits text removal fields and preserves absent optional fields', () => {
    const formData = new FormData()
    formData.set('priority', '2')
    formData.set('css_selectors_to_remove', '.ad\n\n .banner ')

    expect(buildCrawlerUpdates(formData, 'site')).toEqual({
      description: null,
      crawler_type: 'site',
      priority: 2,
      css_selectors_to_remove: ['.ad', ' .banner '],
      link_text_content_to_remove: undefined,
      link_hrefs_to_remove: undefined,
    })
  })

  it('does not turn file entries into removal rules', () => {
    const formData = new FormData()
    formData.set('css_selectors_to_remove', new File(['.ad'], 'selectors.txt'))

    expect(buildCrawlerUpdates(formData, 'site').css_selectors_to_remove).toBeUndefined()
  })
})
