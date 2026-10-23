import { BLACKLISTS } from '@voucha/types/entities/domain-blacklist-source'
import { generateSQL } from './utils/blacklist-source-seed-sql.mts'

export default function generateSeedBlacklistSourcesSQL(): string {
  return generateSQL(BLACKLISTS)
}
