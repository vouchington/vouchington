import { COPYRIGHT_MINIMAL_BLOCKER_PHASES_1 } from './retention-minimal-blocker-phases-1.mts'
import { COPYRIGHT_MINIMAL_BLOCKER_PHASES_2 } from './retention-minimal-blocker-phases-2.mts'
import { COPYRIGHT_MINIMAL_BLOCKER_PHASES_3 } from './retention-minimal-blocker-phases-3.mts'
import { COPYRIGHT_MINIMAL_BLOCKER_PHASES_4 } from './retention-minimal-blocker-phases-4.mts'

/** Every phase caps raw case IDs before evaluating indexed per-row facts. */
export const COPYRIGHT_MINIMAL_BLOCKER_PHASES = [
  ...COPYRIGHT_MINIMAL_BLOCKER_PHASES_1,
  ...COPYRIGHT_MINIMAL_BLOCKER_PHASES_2,
  ...COPYRIGHT_MINIMAL_BLOCKER_PHASES_3,
  ...COPYRIGHT_MINIMAL_BLOCKER_PHASES_4,
]
