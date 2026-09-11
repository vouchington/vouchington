import type { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'

type ModeratorConfig = (typeof MODERATOR_CONFIGS)[number]

/**
 * Wraps prompt text in a PostgreSQL dollar-quote tag, picking a tag that does not already
 * appear in the text so the literal cannot be broken out of early.
 */
function dollarQuote(text: string): string {
  const candidates = ['$prompt$', '$agent$', '$mod$', '$p$']
  for (const tag of candidates) {
    if (!text.includes(tag)) {
      return `${tag}${text}${tag}`
    }
  }
  // Fallback: escape single quotes manually
  return `'${text.replaceAll("'", "''")}'`
}

/**
 * For a single moderator config: deactivate any active prompt whose text, model, or provider
 * differs from the current config, then insert the current prompt if no active matching prompt
 * (text + model + provider) already exists.
 */
export function buildModeratorPromptSyncSQL(config: ModeratorConfig): string {
  const quotedPrompt = dollarQuote(config.prompt)

  return `
UPDATE agent_prompts
SET
  deactivated_at = CURRENT_TIMESTAMP,
  activated_at = NULL
WHERE agent_id = (
  SELECT a.id
  FROM agents a
  JOIN users u ON u.id = a.system_user_id
  WHERE u.username = '${config.slug}'
)
AND activated_at IS NOT NULL
AND deactivated_at IS NULL
AND deleted_at IS NULL
AND (
  MD5(prompt) != MD5(${quotedPrompt})
  OR model_name != '${config.model}'
  OR model_provider != '${config.provider}'
);

INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider, activated_at)
SELECT
  a.id,
  ${quotedPrompt},
  '${config.model}',
  '${config.provider}',
  CURRENT_TIMESTAMP
FROM agents a
JOIN users u ON u.id = a.system_user_id
WHERE u.username = '${config.slug}'
AND NOT EXISTS (
  SELECT 1
  FROM agent_prompts ap
  WHERE ap.agent_id = a.id
    AND ap.activated_at IS NOT NULL
    AND ap.deactivated_at IS NULL
    AND ap.deleted_at IS NULL
    AND MD5(ap.prompt) = MD5(${quotedPrompt})
    AND ap.model_name = '${config.model}'
    AND ap.model_provider = '${config.provider}'
);`
}
