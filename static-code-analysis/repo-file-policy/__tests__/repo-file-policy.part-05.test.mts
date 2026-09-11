import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('rejects writes to derived lifecycle status columns', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    const statusColumn = 'status'
    await track(
      dir,
      'backend/services/data-retention/cleanup-batches.mts',
      [
        'await query(sql`',
        '  UPDATE verified_identities',
        `  SET user_id = \${DELETED_USER_ID}, ${statusColumn} = 'revoked'`,
        '`)',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('verified_identities.status is derived'),
    })
  })

  it('rejects inserts into derived lifecycle status columns', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    const statusColumn = 'status'
    await track(
      dir,
      'backend/services/moderation-reports/__tests__/fixtures.mts',
      [
        'await write(sql`',
        `  INSERT INTO moderation_reports (id, reporter_id, ${statusColumn})`,
        "  VALUES (${id}, ${userId}, 'pending')",
        '`)',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('moderation_reports.status is derived'),
    })
  })

  it(
    'allows explicit topic type routes without [topicType] segment',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'web/app/(topics)/card/[id]/page.tsx',
        'export default function Page() { return null }\n',
      )

      await expect(run(dir)).resolves.toMatchObject({
        stdout: expect.stringContaining('pass'),
      })
    },
  )

  it('allows still-canonical admin operations URLs', async () => {
    const dir = await makeRepo()
    await track(dir, 'web/components/admin/queue-link.tsx', "export const href = '/admin/queues'\n")

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects entity-scoped admin topic create pages without requireAdmin', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/app/(topics)/topics/create/page.tsx',
      "import { PageWithAside } from '@/components/page-with-aside'\nexport default function Page() { return <PageWithAside /> }\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('entity-scoped admin surface must call requireAdmin()'),
    })
  })

  it('rejects entity-scoped admin topic create pages without PageWithAside', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/app/(topics)/topics/create/page.tsx',
      "import { requireAdmin } from '@/lib/auth/require-admin'\nexport default async function Page() { await requireAdmin(); return null }\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'entity-scoped admin surface must render inside PageWithAside',
      ),
    })
  })
})
