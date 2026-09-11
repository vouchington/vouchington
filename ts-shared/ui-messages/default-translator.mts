import { createTranslator, type Translator } from './index.mts'
import enMessages from './messages/en.ts'

/** English-bound translator for contexts without a request-scoped locale. */
export const defaultTranslator: Translator = createTranslator('en', enMessages)
