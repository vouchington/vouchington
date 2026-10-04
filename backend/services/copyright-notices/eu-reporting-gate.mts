import assert from 'http-assert'
import { isCopyrightDsaTransparencyReportsEnabled } from './config.mts'

/** Keep the staff-only report absent until the operator enables this DSA duty. */
export async function assertCopyrightDsaTransparencyReportsEnabled(): Promise<void> {
  assert(await isCopyrightDsaTransparencyReportsEnabled(), 404, 'Not found')
}
