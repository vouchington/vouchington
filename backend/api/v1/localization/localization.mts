import app from '../../app.mts'
import { localizationRoute } from './route.mts'

app.route('/api/v1/localization').get(localizationRoute)
