import { adminQueueTools } from './site-operations-queues.mts'
import { adminJobTools } from './site-operations-jobs.mts'
import { adminConfigTools } from './site-operations-config.mts'

export const adminSiteOperationsTools = [...adminQueueTools, ...adminJobTools, ...adminConfigTools]
