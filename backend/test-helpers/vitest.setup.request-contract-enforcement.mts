/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must wrap every route test in the project, so it cannot be inside a describe. */
import { afterEach } from 'vitest'
import {
  installRequestContractEnforcement,
  takeRequestContractViolations,
} from './api/request-contract-enforcement.mts'

installRequestContractEnforcement()

// Fails the test whose request reached a handler that skipped, or mis-keyed, its request contract
// validation, even when the handler's own response passed.
afterEach(() => {
  const [first] = takeRequestContractViolations()
  if (first) throw first
})
