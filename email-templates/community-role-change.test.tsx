import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCommunityRoleChangeEmail } from './community-role-change-renderer.mts'
import CommunityRoleChangeEmail from './community-role-change.tsx'

describe('renderCommunityRoleChangeEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCommunityRoleChangeEmail(CommunityRoleChangeEmail.PreviewProps!)

    expect(result.subject).toBe('Your role in Travel Hackers has changed')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-role-change.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-role-change.txt', import.meta.url)),
    )
  })

  it('renders demotion-specific copy for a demoted member', async () => {
    const result = await renderCommunityRoleChangeEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      newRole: 'member',
      direction: 'demoted',
    })

    expect(result.html).toContain('Example Community')
    expect(result.html).toContain('was changed to member')
    expect(result.html).not.toContain('promoted')
    expect(result.html).not.toContain('Promoted')
    expect(result.text).toContain('Example Community')
    expect(result.text).toContain('was changed to member')
    expect(result.text).not.toContain('promoted')
    expect(result.text).not.toContain('Promoted')
  })

  it('renders promotion-specific copy for a promoted owner', async () => {
    const result = await renderCommunityRoleChangeEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      newRole: 'owner',
      direction: 'promoted',
    })

    expect(result.subject).toBe('Your role in Example Community has changed')
    expect(result.html).toContain('Example Community')
    expect(result.html).toContain('Been Promoted')
    expect(result.html).toContain('promoted to owner')
    expect(result.html).not.toContain('was changed to')
    expect(result.text).toContain("You've been promoted to owner")
    expect(result.text).toContain('https://voucha.ai/communities/example-community')
  })
})
