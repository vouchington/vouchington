'use client'

import { UpgradeMembershipAsideContent } from '@/components/asides/upgrade-membership-aside-content'
import { storybookMembershipHidden } from '@/storybook/mocks/upgrade-membership-state'

export function UpgradeMembershipAside() {
  if (storybookMembershipHidden()) return null
  return <UpgradeMembershipAsideContent />
}
