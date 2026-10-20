import express, { type Express } from 'express'
import { createDashboard } from '@glidemq/dashboard'
import { armDashboardEventStream } from '@modules/sse-lifecycle'
import allQueues from '@services/queue-monitoring/queue-inventory'

const app: Express = express()
// The dashboard package owns this response, so the cycle ends it here instead of inside startSSE.
app.use((req, res, next) => {
  armDashboardEventStream(req, res)
  next()
})
app.use('/', createDashboard(allQueues))

export default app
