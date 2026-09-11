import { HarnessDispatchError } from 'auto-harness-client/actions'

const MAX_FIELD_CHARACTERS = 512
const MAX_RELATED_CANDIDATES_BYTES = 512

export interface HarnessMetadataEnvironment {
  AGENT_REF?: string
  EXPECTED_HEAD_SHA?: string
  COMPLETION_MODE?: string
  ISSUE_NUMBER?: string
  TRIGGER_COMMENT_ID?: string
  PUBLISH_CONTRACT?: string
  PUBLISH_BASE_REF?: string
  PUBLISH_TARGET_PR_NUMBER?: string
  PUBLISH_TITLE_PREFIX?: string
  PUBLISH_TITLE_SUFFIX?: string
  PUBLISH_DUPLICATE_KEY?: string
  EXISTING_ISSUE_MAINTENANCE?: string
  ALLOW_DUPLICATE_ISSUE_COMPLETION?: string
  PR_LABEL?: string
  PR_SHEPHERD_VERSION?: string
  CHECKPOINT_ISSUE_NUMBER?: string
  SLACK_SOURCE?: string
  SOURCE_RUN_ID?: string
  SOURCE_RUN_ATTEMPT?: string
  SOURCE_RUN_CONCLUSION?: string
  PUBLISH_RELATED_CANDIDATES?: string
}

/**
 * Builds the HARNESS_METADATA payload for a dispatch step. Extracted from an inline
 * `node --input-type=module -e '...'` YAML string (#10096 / C4) so it is linted, typechecked,
 * and unit-testable instead of only exercised through spawned-subprocess tests.
 */
export function buildHarnessDispatchMetadata(
  environment: HarnessMetadataEnvironment,
): Record<string, string> {
  const fields = Object.fromEntries(
    Object.entries({
      agentRef: environment.AGENT_REF,
      expectedHeadSha: environment.EXPECTED_HEAD_SHA,
      completionMode: environment.COMPLETION_MODE,
      issueNumber: environment.ISSUE_NUMBER,
      triggerCommentId: environment.TRIGGER_COMMENT_ID,
      publishContract: environment.PUBLISH_CONTRACT,
      publishBaseRef: environment.PUBLISH_BASE_REF,
      publishTargetPrNumber: environment.PUBLISH_TARGET_PR_NUMBER,
      publishTitlePrefix: environment.PUBLISH_TITLE_PREFIX,
      publishTitleSuffix: environment.PUBLISH_TITLE_SUFFIX,
      publishDuplicateKey: environment.PUBLISH_DUPLICATE_KEY,
      existingIssueMaintenance: environment.EXISTING_ISSUE_MAINTENANCE,
      allowDuplicateIssueCompletion: environment.ALLOW_DUPLICATE_ISSUE_COMPLETION,
      prLabel: environment.PR_LABEL,
      prShepherdVersion: environment.PR_SHEPHERD_VERSION,
      checkpointIssueNumber: environment.CHECKPOINT_ISSUE_NUMBER,
      slackSource: environment.SLACK_SOURCE,
      sourceRunId: environment.SOURCE_RUN_ID,
      sourceRunAttempt: environment.SOURCE_RUN_ATTEMPT,
      sourceRunConclusion: environment.SOURCE_RUN_CONCLUSION,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''),
  )

  for (const [key, value] of Object.entries(fields)) {
    if (value.length > MAX_FIELD_CHARACTERS) {
      throw new HarnessDispatchError('INVALID_METADATA', `${key} exceeds 512 characters`)
    }
  }

  const related: unknown = JSON.parse(environment.PUBLISH_RELATED_CANDIDATES ?? '[]')
  if (!Array.isArray(related)) {
    throw new HarnessDispatchError(
      'INVALID_METADATA',
      'publish-related-candidates must be a JSON array',
    )
  }
  if (related.length > 0) {
    const relatedSerialized = JSON.stringify(related)
    const relatedBytes = Buffer.byteLength(relatedSerialized, 'utf8')
    if (relatedBytes <= MAX_RELATED_CANDIDATES_BYTES) {
      fields.publishRelatedCandidates = relatedSerialized
    } else {
      process.stderr.write(
        `publish-related-candidates dropped: ${relatedBytes} bytes exceeds the ${MAX_RELATED_CANDIDATES_BYTES}-byte non-gating limit\n`,
      )
    }
  }

  return fields
}

if (import.meta.main) {
  process.stdout.write(JSON.stringify(buildHarnessDispatchMetadata(process.env)))
}
