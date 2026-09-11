import type { NavIntent } from './types'
import { PRODUCT_INTENTS } from './product'
import { ADMIN_INTENTS } from './admin'

export const NAV_INTENTS: readonly NavIntent[] = [...PRODUCT_INTENTS, ...ADMIN_INTENTS]
