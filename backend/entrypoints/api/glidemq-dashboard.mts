import express, { type Express } from 'express'
import { createDashboard } from '@glidemq/dashboard'
import allQueues from '@services/queue-monitoring/queue-inventory'

const app: Express = express()
app.use('/', createDashboard(allQueues))

export default app
