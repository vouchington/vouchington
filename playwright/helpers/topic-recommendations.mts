import { type Browser, type TestInfo, withMonitoredPage } from './test.mts'
import { apiRequest } from './api-request.mts'
import { loginAsAdmin } from './auth.mts'
import { randomSuffix } from 'vouchington-tooling/playwright'

export async function seedTopicRecommendations(browser: Browser, testInfo: TestInfo) {
  let topicSlug = ''
  let topicTitle = ''
  let approvedRecId = ''
  let approvedTopicSlug = ''
  let approvedTopicTitle = ''
  let rejectedRecId = ''
  let rejectedTopicSlug = ''
  let rejectedTopicTitle = ''

  const suffix = randomSuffix()
  topicSlug = `pw-topic-rec-${suffix}`
  topicTitle = `Playwright Topic Rec ${suffix}`

  const approvedSuffix = randomSuffix()
  approvedTopicSlug = `pw-topic-rec-approved-${approvedSuffix}`
  approvedTopicTitle = `Playwright Approved Rec ${approvedSuffix}`

  const rejectedSuffix = randomSuffix()
  rejectedTopicSlug = `pw-topic-rec-rejected-${rejectedSuffix}`
  rejectedTopicTitle = `Playwright Rejected Rec ${rejectedSuffix}`

  // Create recommendations as the test user (who is also admin), then approve/reject in same session.
  // page.request uses the project baseURL and the dt/st session cookies, so no page load is needed.
  await withMonitoredPage(browser, testInfo, async page => {
    await loginAsAdmin(page)

    const post = async (path: string, data: object, label: string) => {
      const res = await apiRequest(page, 'POST', path, data)
      if (!res.ok()) throw new Error(`${label} failed: ${res.status()} ${await res.text()}`)
      return res
    }
    const createRecommendation = async (
      title: string,
      slug: string,
      markdown: string,
      label: string,
    ) => {
      const res = await post(
        '/api/v1/posts',
        {
          post_type: 'topic_recommendation',
          title: `Recommend ${title}`,
          markdown,
          topic_title: title,
          topic_slug: slug,
        },
        label,
      )
      return ((await res.json()) as { post: { id: string } }).post.id
    }

    await createRecommendation(
      topicTitle,
      topicSlug,
      'Playwright test recommendation for E2E coverage.',
      'Create rec1',
    )
    approvedRecId = await createRecommendation(
      approvedTopicTitle,
      approvedTopicSlug,
      'Playwright approved recommendation.',
      'Create rec2',
    )
    rejectedRecId = await createRecommendation(
      rejectedTopicTitle,
      rejectedTopicSlug,
      'Playwright rejected recommendation.',
      'Create rec3',
    )

    // Approve rec2 (test user is admin)
    await post(`/api/v1/posts/${approvedRecId}/approvals`, {}, 'Approve rec2')

    // Reject rec3
    await post(
      `/api/v1/posts/${rejectedRecId}/rejections`,
      { reason: 'Playwright test rejection reason' },
      'Reject rec3',
    )
  })
  return {
    topicSlug,
    topicTitle,
    approvedTopicSlug,
    approvedTopicTitle,
    rejectedTopicSlug,
    rejectedTopicTitle,
  }
}
