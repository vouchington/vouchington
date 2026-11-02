/**
 * Guards the staging schema reset, which drops every table. Only an explicit staging opt-in may
 * run it: the production task definition never carries `ALLOW_STAGING_SCHEMA_RESET`.
 */
export function assertStagingSchemaResetAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ENVIRONMENT !== 'staging' || env.ALLOW_STAGING_SCHEMA_RESET !== 'true') {
    throw new Error('staging reset guard')
  }
}
