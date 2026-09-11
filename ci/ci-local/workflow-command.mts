import type { CiLocalCommand } from './types.mts'

export const WEB_TYPECHECK_ENV = {
  NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  ALLOW_TURNSTILE_TEST_KEY: 'true',
}

export function workflowCommand(
  description: string,
  command: string,
  workflow: string,
  contains: string | string[] = command,
): CiLocalCommand {
  return {
    command,
    description,
    source: {
      workflow: `.github/workflows/${workflow}`,
      contains,
    },
  }
}
