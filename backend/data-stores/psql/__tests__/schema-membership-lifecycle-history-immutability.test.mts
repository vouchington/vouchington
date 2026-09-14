import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  attemptTestGrantActivationTransition,
  attemptTestLifecycleLineageBindingTransition,
  attemptTestProviderLineageTransition,
  createTestGrantActivationPeriod,
  createTestImmutableLifecycleLineageBinding,
  createTestNotificationFirstLineage,
  deleteTestLifecycleUser,
  getTestLifecycleLineageBinding,
} from '../../../test-helpers/data-stores/psql/membership-lifecycle-history.mts'

describe('membership lifecycle history immutability', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('fills a notification-first lineage account token once without changing lineage identity', async () => {
    const lineageId = await createTestNotificationFirstLineage()
    await expect(
      attemptTestProviderLineageTransition(lineageId, 'fillAccount'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(attemptTestProviderLineageTransition(lineageId, 'rewriteAccount')).rejects.toThrow(
      'membership provider lineages are immutable',
    )
    await expect(attemptTestProviderLineageTransition(lineageId, 'rewriteLineage')).rejects.toThrow(
      'membership provider lineages are immutable',
    )
  })

  it('freezes lineage binding facts and permits release followed by final purge', async () => {
    const user = await createLocalTestUser()
    const binding = await createTestImmutableLifecycleLineageBinding(user.id)
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'changeBoundAt'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'changeUser'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'changeLineage'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'changeSourceKind'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'delete'),
    ).rejects.toThrow('membership lineage bindings cannot be deleted')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'release'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'rewriteReason'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'clearUser'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(deleteTestLifecycleUser(user.id)).resolves.toMatchObject({ rowCount: 1 })
    await expect(getTestLifecycleLineageBinding(binding.id)).resolves.toMatchObject({
      bound_at: binding.boundAt,
      release_reason: 'account_hard_deleted',
      released_at: expect.any(Date),
      user_id: null,
    })
    await expect(
      attemptTestLifecycleLineageBindingTransition(binding.id, 'rewriteReleasedAt'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
  })

  it('freezes activation facts and permits one open-to-ended transition', async () => {
    const activationId = await createTestGrantActivationPeriod()
    await expect(
      attemptTestGrantActivationTransition(activationId, 'changeStartedAt'),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(attemptTestGrantActivationTransition(activationId, 'changeUser')).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(attemptTestGrantActivationTransition(activationId, 'changeGrant')).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(attemptTestGrantActivationTransition(activationId, 'delete')).rejects.toThrow(
      'membership grant activation periods cannot be deleted',
    )
    await expect(
      attemptTestGrantActivationTransition(activationId, 'endBeforeStart'),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      attemptTestGrantActivationTransition(activationId, 'endAfterStart'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      attemptTestGrantActivationTransition(activationId, 'clearEndedAt'),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(
      attemptTestGrantActivationTransition(activationId, 'rewriteEndedAt'),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
  })
})
