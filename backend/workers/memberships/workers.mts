import { createMembershipsHandlers } from './processors/process-job.mts'

// The memberships jobs run in the shared `background` queue; its worker serves these handlers.
export const membershipsHandlers = createMembershipsHandlers()
