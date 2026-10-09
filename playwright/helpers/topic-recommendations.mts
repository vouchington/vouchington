import { type Browser, type TestInfo, withMonitoredPage } from './test.mts'
import { loginAsTestUser } from './auth.mts'
import { randomSuffix } from './random-id.mts'

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
  // page.evaluate runs fetch in the browser context so the dt/st session cookies are sent correctly.
  await withMonitoredPage(browser, testInfo, async page => {
    await loginAsTestUser(page)

    // Create pending recommendation
    await page.evaluate(
      async data => {
        const res = await fetch('/api/v1/topic-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`Create rec1 failed: ${res.status} ${await res.text()}`)
      },
      {
        title: `Recommend ${topicTitle}`,
        markdown: 'Playwright test recommendation for E2E coverage.',
        topic_title: topicTitle,
        topic_slug: topicSlug,
      },
    )

    // Create recommendation to be approved
    const rec2 = await page.evaluate(
      async data => {
        const res = await fetch('/api/v1/topic-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`Create rec2 failed: ${res.status} ${await res.text()}`)
        return res.json() as Promise<{ post: { id: string } }>
      },
      {
        title: `Recommend ${approvedTopicTitle}`,
        markdown: 'Playwright approved recommendation.',
        topic_title: approvedTopicTitle,
        topic_slug: approvedTopicSlug,
      },
    )
    approvedRecId = rec2.post.id

    // Create recommendation to be rejected
    const rec3 = await page.evaluate(
      async data => {
        const res = await fetch('/api/v1/topic-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`Create rec3 failed: ${res.status} ${await res.text()}`)
        return res.json() as Promise<{ post: { id: string } }>
      },
      {
        title: `Recommend ${rejectedTopicTitle}`,
        markdown: 'Playwright rejected recommendation.',
        topic_title: rejectedTopicTitle,
        topic_slug: rejectedTopicSlug,
      },
    )
    rejectedRecId = rec3.post.id

    // Approve rec2 (test user is admin)
    await page.evaluate(async id => {
      const res = await fetch(`/api/v1/topic-recommendations/${id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Approve rec2 failed: ${res.status} ${await res.text()}`)
    }, approvedRecId)

    // Reject rec3
    await page.evaluate(
      async args => {
        const res = await fetch(`/api/v1/topic-recommendations/${args.id}/rejections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reason: args.reason }),
        })
        if (!res.ok) throw new Error(`Reject rec3 failed: ${res.status} ${await res.text()}`)
      },
      { id: rejectedRecId, reason: 'Playwright test rejection reason' },
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
