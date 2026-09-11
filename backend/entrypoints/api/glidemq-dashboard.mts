import express, { type Express } from 'express'
import { createDashboard } from '@glidemq/dashboard'
import allQueues from '@voucha/api/queues'

const app: Express = express()
app.use('/', createDashboard(allQueues))

export default app
