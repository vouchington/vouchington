import fn from '../api/app.mts'
import { loadProductionRoutes } from './api/production-routes.mts'

// Runs before every test file but records once per worker, so the snapshot never depends on which
// file ran first. It must follow the setup files that vi.mock modules the routes import.
await loadProductionRoutes(fn, () => import('../api/index.mts'))
