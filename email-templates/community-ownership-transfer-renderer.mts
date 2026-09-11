import Template from './community-ownership-transfer.tsx'
import type { CommunityOwnershipTransferEmailProps, EmailRenderResultPromise } from './types.mts'

export function renderCommunityOwnershipTransferEmail(
  props: CommunityOwnershipTransferEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
