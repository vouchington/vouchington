import { COPYRIGHT_CASE_PURGE_PATH_1 } from './retention-case-purge-path-1.mts'
import { COPYRIGHT_CASE_PURGE_PATH_1_REST } from './retention-case-purge-path-1-rest.mts'
import { COPYRIGHT_CASE_PURGE_PATH_2 } from './retention-case-purge-path-2.mts'
import { COPYRIGHT_CASE_PURGE_PATH_2_REST } from './retention-case-purge-path-2-rest.mts'
import { COPYRIGHT_CASE_PURGE_PATH_3 } from './retention-case-purge-path-3.mts'
import { COPYRIGHT_CASE_PURGE_PATH_4 } from './retention-case-purge-path-4.mts'
import { COPYRIGHT_CASE_PURGE_PATH_5 } from './retention-case-purge-path-5.mts'
import { COPYRIGHT_CASE_PURGE_PATH_5_REST } from './retention-case-purge-path-5-rest.mts'
import {
  COPYRIGHT_CASE_EMAIL_LINK_PHASE,
  COPYRIGHT_CASE_EMAIL_PRIVATE_PATHS,
} from './retention-case-purge-email-paths.mts'

const CASE_PATHS = [
  ...COPYRIGHT_CASE_PURGE_PATH_1,
  ...COPYRIGHT_CASE_PURGE_PATH_1_REST,
  ...COPYRIGHT_CASE_PURGE_PATH_2,
  ...COPYRIGHT_CASE_PURGE_PATH_2_REST,
  ...COPYRIGHT_CASE_PURGE_PATH_3,
  ...COPYRIGHT_CASE_PURGE_PATH_4,
  ...COPYRIGHT_CASE_PURGE_PATH_5,
  ...COPYRIGHT_CASE_PURGE_PATH_5_REST,
] as const

// These two legal child tables cite private email rows. They must drain while
// their link and delivery-work parents still exist.
const BEFORE_EMAIL_TABLES = new Set([
  'copyright_notice_email_correspondence_reviews',
  'copyright_notice_lifecycle_changes',
])
const beforeEmail = CASE_PATHS.filter(phase => BEFORE_EMAIL_TABLES.has(phase[0]))
const afterEmail = CASE_PATHS.filter(phase => !BEFORE_EMAIL_TABLES.has(phase[0]))

/** Static child-first paths; each page follows only indexed FK and primary-key ranges. */
export const COPYRIGHT_CASE_PURGE_PHASES = [
  ...beforeEmail,
  ...COPYRIGHT_CASE_EMAIL_PRIVATE_PATHS,
  COPYRIGHT_CASE_EMAIL_LINK_PHASE,
  ...afterEmail,
] as const

export const COPYRIGHT_CASE_EMAIL_LINK_PHASE_INDEX =
  beforeEmail.length + COPYRIGHT_CASE_EMAIL_PRIVATE_PATHS.length

export const COPYRIGHT_CASE_PURGE_TAIL_TABLES = [
  'copyright_notice_party_identities',
  'copyright_territorial_notice_receipts',
] as const
