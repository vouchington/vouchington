import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackPostEnumSurfaces, trackTopicEnumSurfaces } =
    setupRepoFilePolicyTest()

  it('rejects referral-program validation factories without the referral_program guard', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/lib/routes/referral-validation-factories.tsx',
      "import { requireAdmin } from '@/lib/auth/require-admin'\nexport async function load() { await requireAdmin() }\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'entity-scoped admin surface must notFound() non-referral-program topics',
      ),
    })
  })

  it('rejects referral-program validation factories that skip the guarded loader', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/lib/routes/referral-validation-factories.tsx',
      [
        "import { requireAdmin } from '@/lib/auth/require-admin'",
        "async function loadReferralProgram(id: string) { await requireAdmin(); if (topic.topic_type !== 'referral_program') notFound(); return { topic, basePath: id } }",
        'export function createReferralProgramValidationsListPage() {',
        'async function generateMetadata() { return {} }',
        'async function ReferralProgramValidationsListPage({ params }) { const { id } = await params; await loadReferralProgram(id); return null }',
        'return { generateMetadata, default: ReferralProgramValidationsListPage }',
        '}',
        'export function createReferralProgramValidationNewPage() {',
        'async function generateMetadata() { return {} }',
        'async function NewReferralProgramValidationPage({ params }) { const { id } = await params; await loadReferralProgram(id); return null }',
        'return { generateMetadata, default: NewReferralProgramValidationPage }',
        '}',
        'export function createReferralProgramValidationDetailPage() {',
        'async function generateMetadata() { return {} }',
        'async function ReferralProgramValidationDetailPage() { return null }',
        'return { generateMetadata, default: ReferralProgramValidationDetailPage }',
        '}',
        '',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'entity-scoped admin surface must load the guarded referral program in the validation detail route',
      ),
    })
  })

  it('rejects referral-program validation factories that load the wrong route id', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/lib/routes/referral-validation-factories.tsx',
      [
        "import { requireAdmin } from '@/lib/auth/require-admin'",
        "async function loadReferralProgram(id: string) { await requireAdmin(); if (topic.topic_type !== 'referral_program') notFound(); return { topic, basePath: id } }",
        'export function createReferralProgramValidationsListPage() {',
        'async function generateMetadata() { return {} }',
        'async function ReferralProgramValidationsListPage({ params }) { const { id } = await params; await loadReferralProgram(id); return null }',
        'return { generateMetadata, default: ReferralProgramValidationsListPage }',
        '}',
        'export function createReferralProgramValidationNewPage() {',
        'async function generateMetadata() { return {} }',
        'async function NewReferralProgramValidationPage({ params }) { const { id } = await params; await loadReferralProgram(id); return null }',
        'return { generateMetadata, default: NewReferralProgramValidationPage }',
        '}',
        'export function createReferralProgramValidationDetailPage() {',
        'async function generateMetadata() { return {} }',
        'async function ReferralProgramValidationDetailPage({ params }) { const { validationId } = await params; await loadReferralProgram(validationId); return null }',
        'return { generateMetadata, default: ReferralProgramValidationDetailPage }',
        '}',
        '',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'entity-scoped admin surface must load the guarded referral program in the validation detail route',
      ),
    })
  })

  it('rejects topic settings factories that skip requireAdmin in a route factory', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/lib/routes/topic-settings-factories.tsx',
      [
        'export function createTopicSettingsPage() {',
        'async function generateMetadata() { return {} }',
        'async function TopicSettingsRoutePage() { await requireAdmin(); return null }',
        'return { generateMetadata, default: TopicSettingsRoutePage }',
        '}',
        'export function createTopicSettingsAboutPage() {',
        'async function generateMetadata() { return {} }',
        'async function TopicSettingsAboutRoutePage() { return null }',
        'return { generateMetadata, default: TopicSettingsAboutRoutePage }',
        '}',
        'export function createTopicSettingsBehaviorPage() {',
        'async function generateMetadata() { return {} }',
        'async function TopicSettingsBehaviorRoutePage() { await requireAdmin(); return null }',
        'return { generateMetadata, default: TopicSettingsBehaviorRoutePage }',
        '}',
        '',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'entity-scoped admin surface must call requireAdmin() in the topic settings about route',
      ),
    })
  })

  it('rejects missing protected entity-scoped admin surface files', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'web/app/(topics)/topics/aliases/page.tsx',
      "import { PageWithAside } from '@/components/page-with-aside'\nimport { requireAdmin } from '@/lib/auth/require-admin'\nexport default async function Page() { await requireAdmin(); return <PageWithAside /> }\n",
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'web/app/(topics)/topics/create/page.tsx: protected entity-scoped admin surface must exist',
      ),
    })
  })

  it('rejects missing protected admin surfaces in the real repo shape even when none survive', async () => {
    const dir = await makeRepo()
    await track(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    await track(dir, 'web/package.json', '{"name":"web"}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'web/app/(topics)/topics/create/page.tsx: protected entity-scoped admin surface must exist',
      ),
    })
  })

  it('rejects tracked protected admin surface files missing from disk', async () => {
    const dir = await makeRepo()
    const file = 'web/app/(topics)/topics/create/page.tsx'
    await track(
      dir,
      file,
      "import { PageWithAside } from '@/components/page-with-aside'\nimport { requireAdmin } from '@/lib/auth/require-admin'\nexport default async function Page() { await requireAdmin(); return <PageWithAside /> }\n",
    )
    await rm(join(dir, file))

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'web/app/(topics)/topics/create/page.tsx: protected entity-scoped admin surface must exist',
      ),
    })
  })

  it('allows aligned finite enum route surfaces', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', card: 'card' },
    })
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
    })
    await track(dir, 'web/app/(topics)/domain/[id]/page.tsx', 'export default {}\n')
    await track(dir, 'web/app/(topics)/url/[id]/page.tsx', 'export default {}\n')

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('rejects backend/web topicTypes slug mismatches', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await trackTopicEnumSurfaces(dir, {
      backend: { topic: 'topic', card: 'card' },
      web: { topic: 'topic', card: 'payment-card' },
      routes: ['topic', 'card'],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('topicTypes.card.slug is "payment-card"'),
    })
  })
})
