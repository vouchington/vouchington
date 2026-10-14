import { vi } from 'vitest'
import type {
  admitCopyrightEmailCorrespondence,
  associateCopyrightEmailIntakeWithNotice,
  approveCopyrightEmailIntake,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  recordCopyrightEmailIntakeLegalProcess,
  rejectCopyrightEmailCorrespondence,
  rejectCopyrightEmailIntake,
  replayCopyrightEmailIntakeReply,
  requestCopyrightEmailIntakeInformation,
} from '@/lib/api/client/copyright-email-intakes'
import type { resolveCopyrightNoticeTargets } from '@/lib/api/client/copyright-notice-targets'
import type { getCopyrightNoticeAssociationTarget } from '@/lib/api/client/copyright-notice-association-target'

// Return these from `vi.mock` factories for the copyright email review client modules. Import this
// module before the component under test so the factories can read them.
export const copyrightEmailIntakesClientMock = {
  approveCopyrightEmailIntake: vi.fn<typeof approveCopyrightEmailIntake>(),
  associateCopyrightEmailIntakeWithNotice: vi.fn<typeof associateCopyrightEmailIntakeWithNotice>(),
  admitCopyrightEmailCorrespondence: vi.fn<typeof admitCopyrightEmailCorrespondence>(),
  getCopyrightEmailIntake: vi.fn<typeof getCopyrightEmailIntake>(),
  listCopyrightEmailIntakes: vi.fn<typeof listCopyrightEmailIntakes>(),
  recordCopyrightEmailIntakeLegalProcess: vi.fn<typeof recordCopyrightEmailIntakeLegalProcess>(),
  rejectCopyrightEmailIntake: vi.fn<typeof rejectCopyrightEmailIntake>(),
  replayCopyrightEmailIntakeReply: vi.fn<typeof replayCopyrightEmailIntakeReply>(),
  rejectCopyrightEmailCorrespondence: vi.fn<typeof rejectCopyrightEmailCorrespondence>(),
  requestCopyrightEmailIntakeInformation: vi.fn<typeof requestCopyrightEmailIntakeInformation>(),
}

export const copyrightNoticeTargetsClientMock = {
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}

export const copyrightNoticePickerClientMock = {
  getCopyrightNoticeAssociationTarget: vi.fn<typeof getCopyrightNoticeAssociationTarget>(),
}
