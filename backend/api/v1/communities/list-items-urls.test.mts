import { describeCommunityListItemRoutes } from '@voucha/test-helpers/community-list-item-routes'
import { insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'

describeCommunityListItemRoutes({
  segment: 'urls',
  itemType: 'url',
  bodyKey: 'url_id',
  createEntityId: async random => {
    const hostnameId = await insertTestUrlHostname({ hostname: `url-item-${random}.example.com` })
    return insertTestUrl({ url: `https://url-item-${random}.example.com/page`, hostnameId })
  },
})
