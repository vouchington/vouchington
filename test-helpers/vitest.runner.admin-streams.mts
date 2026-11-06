import { createWorkerAttachmentGuardRunner } from '@vouchington/worker-runtime/testing'
import PrivateValkeyRunner from './vitest.runner.private-valkey.mts'

class AdminStreamsRunner extends PrivateValkeyRunner {
  constructor(config: ConstructorParameters<typeof PrivateValkeyRunner>[0]) {
    super(config, 'admin-streams')
  }
}

export default createWorkerAttachmentGuardRunner(AdminStreamsRunner)
