import {
  adminOutputSchema as packageAdminOutputSchema,
  filterPrivateOutputFields as packageFilterPrivateOutputFields,
  wrapUntrustedOutput,
} from '@vouchington/mcp-server/untrusted'

const UNTRUSTED_FIELDS = new Set([
  'reason',
  'summary',
  'gap',
  'rationale',
  'explanation',
  'structured_output',
  'input_data',
  'error_message',
  'note',
  'reporter_username',
  'username',
  'verified_display_name',
  'text',
  'appeal_reason',
  'ai_public_response',
  'ai_internal_response',
  'claim_text',
  'details',
  'public_message',
  'issued_by_username',
  'evidence',
  'claimed_role',
  'rejection_reason',
  'revocation_reason',
  'body',
  'body_text',
  'private_note',
  'description',
  'title',
  'markdown',
  'markdown_preview',
  'public_response',
  'internal_notes',
  'ai_summary_markdown',
  'cluster_reason',
  'css_selectors_to_remove',
  'link_text_content_to_remove',
  'link_hrefs_to_remove',
  'content_selectors',
  'work_description',
  'display_name',
  'contact',
  'statement',
  'category_text',
  'subtitle',
  'slug',
])
const PRIVATE_FIELDS = new Set([
  'verification_token_hash',
  'access_token',
  'refresh_token',
  'client_secret',
  'raw_key',
  'password_hash',
])

const fieldSets = (additionalUntrustedFields: readonly string[]) => ({
  untrusted: additionalUntrustedFields.length
    ? new Set([...UNTRUSTED_FIELDS, ...additionalUntrustedFields])
    : UNTRUSTED_FIELDS,
  private: PRIVATE_FIELDS,
})

/** Filter before serializing an untrusted JSON field, including its nested objects. */
export function filterPrivateOutputFields(value: unknown): unknown {
  return packageFilterPrivateOutputFields(value, PRIVATE_FIELDS)
}

export function adminOutputSchema(
  value: unknown,
  additionalUntrustedFields: readonly string[] = [],
): unknown {
  return packageAdminOutputSchema(value, fieldSets(additionalUntrustedFields))
}

export function wrapAdminOutput(
  value: unknown,
  additionalUntrustedFields: readonly string[] = [],
): Promise<unknown> {
  return wrapUntrustedOutput(value, fieldSets(additionalUntrustedFields))
}
