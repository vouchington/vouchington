import '@voucha/api'
import '@voucha/rss'
import '@backend/md'
// Side-effect registration: wires every dependency-inversion service registrar (see
// backend/service-registrations/index.mts) so registry getters never hit the "handler not
// registered" fail-fast guard.
import '@backend/service-registrations'
import './infra/index.mts'
import app from '@voucha/api/app'

export default app
