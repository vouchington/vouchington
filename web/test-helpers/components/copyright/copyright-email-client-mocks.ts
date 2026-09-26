import { vi } from 'vitest'
import type {
  admitCopyrightEmailCorrespondence,
  approveCopyrightEmailIntake,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailCorrespondence,
  rejectCopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import type { resolveCopyrightNoticeTargets } from '@/lib/api/client/copyright-notice-targets'

// Return these from `vi.mock` factories for the copyright email review client modules. Import this
// module before the component under test so the factories can read them.
export const copyrightEmailIntakesClientMock = {
  approveCopyrightEmailIntake: vi.fn<typeof approveCopyrightEmailIntake>(),
  admitCopyrightEmailCorrespondence: vi.fn<typeof admitCopyrightEmailCorrespondence>(),
  getCopyrightEmailIntake: vi.fn<typeof getCopyrightEmailIntake>(),
  listCopyrightEmailIntakes: vi.fn<typeof listCopyrightEmailIntakes>(),
  rejectCopyrightEmailIntake: vi.fn<typeof rejectCopyrightEmailIntake>(),
  rejectCopyrightEmailCorrespondence: vi.fn<typeof rejectCopyrightEmailCorrespondence>(),
}

export const copyrightNoticeTargetsClientMock = {
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}
