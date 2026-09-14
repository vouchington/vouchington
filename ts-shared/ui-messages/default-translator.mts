import { createTranslator, type Translator } from './index.mts'
import { catalogTreeForLocale } from './load-catalog-json.mts'

/** English-bound translator for contexts without a request-scoped locale. */
export const defaultTranslator: Translator = createTranslator('en', catalogTreeForLocale('en'))
