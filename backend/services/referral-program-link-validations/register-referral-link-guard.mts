import { registerReferralLinkGuard } from '@services/entity-relations/referral-link-guard-registry'
import { assertUrlsAreNotReferralLinks } from './assert-urls-are-not-referral-links.mts'

// Registers this package's referral-link check as entity-relations' url-relation guard, as a
// side effect of importing this module (see
// backend/services/referral-program-link-validations/index.mts, which imports this first for
// its side effects). Keeps entity-relations from depending on referral-program-link-validations.
registerReferralLinkGuard(assertUrlsAreNotReferralLinks)
