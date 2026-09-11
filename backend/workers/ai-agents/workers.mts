export { createAIAgentsWorker, processAIAgentWorkerJob } from './workers/core.mts'
import { createAIAgentsWorker } from './workers/core.mts'

export const ai_agents = createAIAgentsWorker()
