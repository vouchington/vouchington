# Email Digests

Source entrypoint: [backend/queues/email-digests/README.md](../../../../../backend/queues/email-digests/README.md)

`email-digests` is a domain of the shared [background queue](../background/README.md). It holds the
three scheduled email dispatchers and every send they fan out. Event-triggered sends (login token,
verification, invite, export ready, welcome, application decision, role change, ownership transfer,
copyright notice) stay in the separate [`emails` queue](../emails/README.md).

## Why a separate queue and domain

GlideMQ ranked priority orders only jobs promoted in the same batch. A login email enqueued after a
digest fan-out would wait behind every send already on the ready list. The rule is
[queue boundaries](../../../../checklists/backend-queues.md#queue-boundaries): work a person is
watching gets its own queue; bulk work shares `background`.

## Jobs

| Job (`email-digests.` prefix)                                                                                                                                                            | Priority | Notes                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `dispatchEngagementEmails`                                                                                                                                                               | 100      | Hourly; scheduler `email-digests-engagement`                         |
| `dispatchCommunityModerationSummaryEmails`                                                                                                                                               | 100      | Every minute; scheduler `email-digests-moderation-summary`           |
| `dispatchApiKeyExpiryReminders`                                                                                                                                                          | 100      | Hourly, paged by `afterId`; scheduler `email-digests-api-key-expiry` |
| `processSendFollowTopicsEmail`, `processSendPostReferralLinkEmail`, `processSendFollowNewsSourcesEmail`, `processSendCommunityModerationSummaryEmail`, `processSendApiKeyExpiryReminder` | 10       | Sends the dispatchers fan out                                        |

Dispatchers stay the lowest tier, so each run or cursor page starts only after the sends already
promoted have drained. No other job in the domain may use a priority of 100 or more.

The domain runs under one domain-wide group of 5, the worker concurrency the old queue had.
Deduplication ids carry the `email-digests:` prefix. Payloads are validated by the handler before
any processor runs. See [API-key expiry reminders](../../services/api-keys/README.md#expiry-reminders)
for the reminder contract.

The [worker](../workers/email-digests/README.md) registers the handlers.
