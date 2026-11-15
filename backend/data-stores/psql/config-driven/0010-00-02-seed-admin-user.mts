import { buildSeedAdminUserSQL } from './utils/system-user-seed.mts'

/** loaded by path by the config-driven migration runner */
export default function generateSeedAdminUserSQL(): string {
  return buildSeedAdminUserSQL('jong', 'jong@voucha.ai')
}
