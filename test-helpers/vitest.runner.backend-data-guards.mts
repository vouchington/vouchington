import { createWorkerAttachmentGuardRunner } from '@vouchington/worker-runtime/testing'
import SharedDbScopeGuardRunner from './vitest.runner.shared-db-scope-guard.mts'

export default createWorkerAttachmentGuardRunner(SharedDbScopeGuardRunner)
