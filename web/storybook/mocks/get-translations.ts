import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'

/** Storybook stub — the real helper reaches next/headers via load-server-messages. */
export const getTranslations = async () => createTranslator('en', await loadJsonMessages('en'))
