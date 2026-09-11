// Central side-effect import root for every `@services/*` dependency-inversion registrar.
//
// Each import below exists ONLY for its module-load side effect: the target file calls a
// `register*()` function at top level, wiring a handler into another service's registry so that
// service's `getRegistered*()` getter stops throwing a `*_UNREGISTERED` error. No process
// entrypoint should import a `register-*.mts` file directly — every entrypoint instead imports
// this package once, so a registry added here is available everywhere unconditionally. See
// `backend/services/README.md` for the pattern and `.no-mistakes.yml`'s
// `required-entrypoint-reachability` rules for the static enforcement.
//
// Registers with @services/entity-relations' election-vote-handler registry.
import '@services/elections-votes/entity-relation/register-election-vote-handler'
// Registers with @services/entity-relations' blocked-hostname-guard registry.
import '@services/urls/register-blocked-hostname-guard'
// Registers with @services/entity-relations' referral-link-guard registry.
import '@services/referral-program-link-validations/register-referral-link-guard'
// Registers with @services/entity-relations' post-related-urls-guard registry.
import '@services/posts/register-post-related-urls-guard'
// Registers with @services/entity-relations' bookmark-bloom-handler registry.
import '@services/bookmarks/register-bookmark-bloom-handler'
// Registers with @services/topics' image-exists-guard registry.
import '@services/images/register-image-exists-guard'
// Registers with @services/wikipedia-topic-recommendations' recommendation-approved-handler registry.
import '@services/user-import-export/register-auto-follow-on-approval-handler'
