import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'

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

/** Filter before serializing an untrusted JSON field, including its nested objects. */
export function filterPrivateOutputFields(value: unknown): unknown {
  if (value instanceof Date || Buffer.isBuffer(value)) return value
  if (Array.isArray(value)) return value.map(filterPrivateOutputFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRIVATE_FIELDS.has(key))
      .map(([key, child]) => [key, filterPrivateOutputFields(child)]),
  )
}

/** Standard JSON Schema shape for text that an agent must treat as data. */
export function untrustedText(): Record<string, unknown> {
  return {
    type: 'string',
  }
}

export function adminOutputSchema(
  value: unknown,
  additionalUntrustedFields: readonly string[] = [],
): unknown {
  if (Array.isArray(value))
    return value.map(child => adminOutputSchema(child, additionalUntrustedFields))
  if (!value || typeof value !== 'object') return value
  const schema = value as Record<string, unknown>
  const output = Object.fromEntries(
    Object.entries(schema).map(([key, child]) => [
      key,
      adminOutputSchema(child, additionalUntrustedFields),
    ]),
  )
  if (schema['properties'] && typeof schema['properties'] === 'object') {
    const properties = schema['properties'] as Record<string, unknown>
    output['properties'] = Object.fromEntries(
      Object.entries(properties)
        .filter(([key]) => !PRIVATE_FIELDS.has(key))
        .map(([key, child]) => [
          key,
          UNTRUSTED_FIELDS.has(key) || additionalUntrustedFields.includes(key)
            ? { anyOf: [untrustedText(), { type: 'null' }] }
            : adminOutputSchema(child, additionalUntrustedFields),
        ]),
    )
    if (Array.isArray(schema['required']))
      output['required'] = schema['required'].filter(key => !PRIVATE_FIELDS.has(String(key)))
  }
  return output
}

export async function wrapAdminOutput(
  value: unknown,
  additionalUntrustedFields: readonly string[] = [],
): Promise<unknown> {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value))
    return Promise.all(value.map(child => wrapAdminOutput(child, additionalUntrustedFields)))
  if (!value || typeof value !== 'object') return value
  const entries = await Promise.all(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRIVATE_FIELDS.has(key))
      .map(async ([key, child]) => {
        if (
          (UNTRUSTED_FIELDS.has(key) || additionalUntrustedFields.includes(key)) &&
          child !== null &&
          child !== undefined
        ) {
          const text = typeof child === 'string' ? child : JSON.stringify(child)
          const sanitized = await sanitizePromptInjection(text)
          return [key, wrapExternalContent(sanitized, { source: 'api_response', contentType: key })]
        }
        return [key, await wrapAdminOutput(child, additionalUntrustedFields)]
      }),
  )
  return Object.fromEntries(entries)
}
