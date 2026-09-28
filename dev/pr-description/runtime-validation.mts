import { runGh } from 'vouchington-tooling/gh-cli'

import { isAutomationContext } from '../codex-hooks/policy.mts'
import { createClosingIssueReferenceResolver } from './related-issues.mts'
import {
  type IssueReferenceValidationOptions,
  validatePrBodyWithIssueReferences,
} from './validate.mts'

const resolveIssueReference = createClosingIssueReferenceResolver(runGh)

export async function validateBody(body: string, options: IssueReferenceValidationOptions = {}) {
  return validatePrBodyWithIssueReferences(body, resolveIssueReference, {
    ...options,
    automationContext: isAutomationContext(),
  })
}
