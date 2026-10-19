import { describe, expect, it } from 'vitest'

import { refreshMaterializedView } from './refresh-materialized-view.mts'

describe('refreshMaterializedView', () => {
  it('rejects a view outside the app allowlist', async () => {
    await expect(refreshMaterializedView('pg_class')).rejects.toThrow(/pg_class/)
  })
})
