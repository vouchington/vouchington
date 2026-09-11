import { describe, expect, it } from 'vitest'
import { createProfileLink, updateProfileLink } from './profile-links.mts'

describe('createProfileLink', () => {
  it('rejects URL fragments because profile links are stored through the urls table', async () => {
    await expect(
      createProfileLink('00000000-0000-7000-8000-000000000000', {
        link_type: 'url',
        url: 'https://example.com/#/invite',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must be a valid URL without a fragment',
    })
  })

  it('rejects URL fragments on update because profile links are stored through the urls table', async () => {
    await expect(
      updateProfileLink(
        '00000000-0000-7000-8000-000000000000',
        '00000000-0000-7000-8000-000000000001',
        {
          url: 'https://example.com/#/invite',
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must be a valid URL without a fragment',
    })
  })

  it('rejects unsupported URL schemes with a scheme-specific message', async () => {
    await expect(
      createProfileLink('00000000-0000-7000-8000-000000000000', {
        link_type: 'url',
        url: 'ftp://example.com/invite',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'url must use http or https',
    })
  })
})
