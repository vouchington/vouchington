import { registerBlockedHostnameGuard } from '@services/entity-relations/blocked-hostname-guard-registry'
import { assertUrlsHaveNoBlockedHostnames } from './assert-hostname-not-blocked.mts'

// Registers this package's blocked-hostname check as entity-relations' url-relation guard, as a
// side effect of importing this module (see backend/services/urls/index.mts, which imports this
// first for its side effects). Keeps entity-relations from depending on urls.
registerBlockedHostnameGuard(assertUrlsHaveNoBlockedHostnames)
