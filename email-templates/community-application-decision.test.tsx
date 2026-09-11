import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCommunityApplicationDecisionEmail } from './community-application-decision-renderer.mts'
import CommunityApplicationDecisionEmail from './community-application-decision.tsx'

describe('renderCommunityApplicationDecisionEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCommunityApplicationDecisionEmail(
      CommunityApplicationDecisionEmail.PreviewProps!,
    )

    expect(result.subject).toBe('Your application to Travel Hackers was approved')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-application-decision.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-application-decision.txt', import.meta.url)),
    )
  })

  it('includes the rejection reason in both formats when provided', async () => {
    const result = await renderCommunityApplicationDecisionEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      status: 'rejected',
      rejectionReason: 'Community guidelines were not met',
    })

    expect(result.subject).toBe('Your application to Example Community was rejected')
    expect(result.html).toContain('Community guidelines were not met')
    expect(result.html).toContain('Reason:')
    expect(result.text).toContain('Community guidelines were not met')
    expect(result.text).toContain('Reason:')
  })

  it('omits the rejection reason section when no reason is provided', async () => {
    const result = await renderCommunityApplicationDecisionEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      status: 'rejected',
    })

    expect(result.html).not.toContain('Reason:')
    expect(result.text).not.toContain('Reason:')
  })

  it('never shows a rejection-reason section for approved status', async () => {
    const result = await renderCommunityApplicationDecisionEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      status: 'approved',
      rejectionReason: 'This should be ignored',
    })

    expect(result.html).not.toContain('This should be ignored')
    expect(result.html).not.toContain('Reason:')
    expect(result.text).not.toContain('This should be ignored')
    expect(result.text).not.toContain('Reason:')
  })
})
