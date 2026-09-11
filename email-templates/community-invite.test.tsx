import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCommunityInviteEmail } from './community-invite-renderer.mts'
import CommunityInviteEmail from './community-invite.tsx'

describe('renderCommunityInviteEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCommunityInviteEmail(CommunityInviteEmail.PreviewProps!)

    expect(result.subject).toBe("You've been invited to join Travel Hackers")
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-invite.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-invite.txt', import.meta.url)),
    )
  })

  it('includes the encoded invite code in both formats', async () => {
    const result = await renderCommunityInviteEmail({
      communityName: 'Example Community',
      inviterName: 'Jamie',
      code: 'abc 123/+?',
    })

    const encodedCode = encodeURIComponent('abc 123/+?')

    expect(result.html).toContain(`/communities/invite/${encodedCode}`)
    expect(result.html).toContain('Jamie')
    expect(result.text).toContain(`/communities/invite/${encodedCode}`)
    expect(result.text).toContain('Jamie')
  })
})
