import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTestPostDeletedAt } from '@voucha/test-helpers'
import { createTestPostDeliveryFixture } from '@voucha/test-helpers/media-delivery-post'
import { deletePost } from '../delete.mts'

describe('post deletion delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('deletes a post without publishing an edge denial', async () => {
    const fixture = await createTestPostDeliveryFixture()

    await deletePost(fixture.user, fixture.post)

    expect(await getTestPostDeletedAt(fixture.postId)).not.toBeNull()
    expect(fixture.edge.put).not.toHaveBeenCalled()
    expect(fixture.edge.invalidatePath).not.toHaveBeenCalled()
  })
})
