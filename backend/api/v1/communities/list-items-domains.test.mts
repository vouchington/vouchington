import { describeCommunityListItemRoutes } from '@voucha/test-helpers/community-list-item-routes'
import { insertTestUrlHostname } from '@voucha/test-helpers'

describeCommunityListItemRoutes({
  segment: 'domains',
  itemType: 'url_hostname',
  bodyKey: 'url_hostname_id',
  createEntityId: random =>
    insertTestUrlHostname({ hostname: `domain-item-${random}.example.com` }),
})
