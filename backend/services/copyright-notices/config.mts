import { DynamicConfig } from '@data-stores/valkey'

/**
 * Audited operator switches for copyright handling. Each field ships with the code that reads it;
 * defaults keep launch moderator-first, so any automation must be switched on deliberately.
 */
export const copyrightConfig = new DynamicConfig({
  key: 'copyright',
  fieldTypes: {
    automaticProvisionalWithholding: 'boolean',
  },
  defaultFields: {
    automaticProvisionalWithholding: false,
  },
})

/**
 * Whether a clear anti-spam screen of a signed-in notice may withhold its targets before a
 * moderator reviews it. Off keeps every notice in the staff queue until a moderator decides.
 */
export async function isAutomaticProvisionalWithholdingEnabled(): Promise<boolean> {
  await copyrightConfig.waitForInitialization()
  return copyrightConfig.getFields().automaticProvisionalWithholding === true
}
