import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Notification } from '@/types/api-responses'
import { NotificationIcon } from '../notification-icon'

const communityNotificationTypes = [
  'community_application_decision',
  'community_role_change',
  'community_ownership_transfer',
  'community_activity_digest',
] satisfies Notification['entity_type'][]

describe('NotificationIcon', () => {
  it.each(communityNotificationTypes)('renders a notification bell for %s', entityType => {
    const { container } = render(<NotificationIcon entityType={entityType} />)

    expect(container.querySelector('.lucide-bell')).not.toBeNull()
  })
})
