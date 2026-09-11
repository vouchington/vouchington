import type { RecordRevealBody } from '@/lib/api/client/moderation-exposure'
import type { ExposureState } from '@/types/moderation-exposure'

export interface UseExposureCooldownReturn {
  exposureState: ExposureState | null
  exposureStateIsStale: boolean
  revealBlocked: boolean
  recordReveal: (body: RecordRevealBody) => void
  refreshExposureState: () => Promise<void>
  dismissBreakPrompt: () => void
  showBreakPrompt: boolean
}
