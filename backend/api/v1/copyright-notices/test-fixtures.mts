import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'

export async function createCopyrightFormFixture() {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const postId = await insertTestPost({
    title: `Copyright route test ${crypto.randomUUID()}`,
    slug: `copyright-route-test-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'Hosted image for a copyright-notice route test.',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  return {
    claimant,
    poster,
    form: {
      jurisdiction: 'us_dmca',
      claimant_display_name: 'Copyright claimant',
      claimant_contact: 'claimant@example.test',
      claimant_email: 'claimant@example.test',
      work_description: 'A photograph owned by the claimant.',
      good_faith_belief: true,
      accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature: 'Copyright claimant',
      targets: [
        { post_id: postId, image_id: imageId, target_url: `https://voucha.ai/posts/${postId}` },
      ],
    },
  }
}

export async function createNotice(
  fixture: Awaited<ReturnType<typeof createCopyrightFormFixture>>,
) {
  const request = createRequest()
  await request.authenticateAs(fixture.claimant)
  return (
    await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(fixture.form)
      .expect(202)
  ).body.copyright_notice.id as string
}

export function counterNoticeBody(targetId: string): Record<string, unknown> {
  return {
    name: 'Hosted-material poster',
    address: '1 Main Street, Example City',
    telephone: '555-0100',
    consent_to_federal_jurisdiction: true,
    consent_to_service_of_process: true,
    good_faith_misidentification_under_penalty_of_perjury: true,
    electronic_signature: 'Hosted-material poster',
    target_ids: [targetId],
  }
}
