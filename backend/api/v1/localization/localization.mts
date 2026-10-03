import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import { localizationQuery, localizationRoute } from './route.mts'

app.route('/api/v1/localization').get(ctx => {
  apiQuery('GET:/api/v1/localization', localizationQuery)
  localizationRoute(ctx)
})
