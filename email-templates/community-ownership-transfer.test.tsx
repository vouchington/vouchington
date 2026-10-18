import { renderCommunityOwnershipTransferEmail } from './index.mts'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import CommunityOwnershipTransferEmail from './community-ownership-transfer.tsx'
import { omitReactEmailPreviewPadding } from './test-helpers/omit-react-email-preview-padding.mts'

describe('renderCommunityOwnershipTransferEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCommunityOwnershipTransferEmail(
      CommunityOwnershipTransferEmail.PreviewProps!,
    )

    expect(result.subject).toBe('Ownership of Travel Hackers has changed')
    await expect(omitReactEmailPreviewPadding(result.html)).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-ownership-transfer.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-ownership-transfer.txt', import.meta.url)),
    )
  })

  it('renders a neutral confirmation for the previous owner', async () => {
    const result = await renderCommunityOwnershipTransferEmail({
      communityName: 'Example Community',
      communityUrl: 'https://voucha.ai/communities/example-community',
      recipientRole: 'previous_owner',
    })

    expect(result.html).toContain('Example Community')
    expect(result.text).toContain('Example Community')
    expect(result.html).not.toContain('Congratulations')
    expect(result.text).not.toContain('Congratulations')
  })
})
