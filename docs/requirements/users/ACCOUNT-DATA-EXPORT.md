# Account Data Export

Users can download a copy of their personal data from account settings (`/my/data`). This feature
satisfies GDPR "Right to Data Portability" and CCPA "Right to Know" requirements. See
[account deletion](./ACCOUNT-DELETION-DATA-REQUEST.md) for the separate erasure lifecycle.

## Data Export

- Users can request a download of all their personal data from account settings.
- Native clients expose the in-app request, status refresh, and ready export download link from the
  settings account-data section.
- Only one active export request is allowed at a time.
- Export is prepared as a background job and may take a few minutes.
- User is notified in the UI when the export is ready (polls for status every 5 seconds).
- The download is a ZIP file containing CSV files for each data category:
  - `profile.csv` – username, display preferences, bio, privacy/processing settings, marketing consent, created date
  - `posts.csv` – all non-deleted posts created by the user
  - `votes.csv` – all votes cast by the user
  - `emails.csv` – email addresses
  - `phones.csv` – phone numbers
  - `passkeys.csv` – passkey metadata, never private keys
  - `oauth-accounts.csv` – connected OAuth account metadata
  - `followed-rss-feeds.csv` – followed RSS feeds with source URLs and topic details
  - `followed-topics.csv` – followed topics with slugs and topic types
  - `entity-relations.csv` – follows, mutes, blocks, and other relation predicates
  - `bookmarks.csv` – saved/bookmarked data
  - `consents.csv` – legal and cookie consent ledger records
  - `referral-attributions.csv` – referral click attributions
  - `copyright-*.csv` – the account's copyright records, with a conservative redaction rule (see
    [Copyright records](#copyright-records))
- Boolean fields in export CSVs use `true`/`false`; unset values remain empty.
- Download link expires after 7 days.
- Users can request a new export at any time after the previous one has expired, failed, or is ready.
- Admins can request exports on behalf of any user.

## Copyright records

The export carries the user's own copyright records, because the right to know covers them. The rule
is deliberately conservative: the export reveals nothing the user cannot already see in the app,
except the user's own submissions. Counsel confirms it as part of the copyright launch readiness
work in [#1230](https://github.com/vouchington/vouchington/issues/1230).

- **Own filings, decrypted in full.** `copyright-notices-filed.csv` holds each notice the user filed
  while signed in: claimant name, contact, work description, statements, signature, and target
  references. `copyright-counter-notices.csv` holds the user's counter-notices with their name,
  address, telephone, consents, statements, and signature. `copyright-appeals.csv` holds their
  appeals with the stated reason. Only signed-in submissions made by the account are included; a
  record a moderator recorded on someone's behalf stays out of the moderator's own export.
- **The other side, as the participant sees it.** `copyright-cases.csv` lists each accepted case the
  user is a party to, as claimant or as poster of a targeted image, using the same projection the
  in-app participant view uses for a member: dates, target visibility and restriction state, the
  claimant's public profile, and the member timeline. It never contains the other party's legal
  name, address, email, phone, or signature, staff rationale, notes, AI guidance, raw email, or
  staff-only timeline events.
- **Repeat-infringer records about the user.** `copyright-repeat-infringer-incidents.csv` lists
  incident dates, whether each is operative, the linked notice id, and any staff disposition, with no
  claimant identity. `copyright-repeat-infringer-reviews.csv` lists decided account reviews with
  their outcome and dates. Rationales and open reviews are withheld.
- **Out of scope.** Claimants who only ever used email have no account, so those requests are
  handled manually. EU and UK redress records, delivery and outbox rows (transport, not user records),
  and court or CCB filings are not exported; no signed-in court or CCB filing exists yet.
- **Erased accounts** have no copyright records: their claimant and submitter links are cleared, and
  the other party's case view loses the attribution.

## Data Request Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: POST /api/v1/users/:idOrSlug/data-request
    pending --> processing: processing_started_at set
    pending --> failed: failed_at set
    processing --> ready: completed_at + s3_key set
    processing --> failed: failed_at set
    ready --> expired: expires_at elapses, s3_key cleared
    failed --> [*]
    expired --> [*]
```

Status is not a stored enum — `deriveDataRequestStatus()` computes it from the timestamp/`s3_key`
columns on read: `failed_at` set means `failed`; `completed_at` set with no `s3_key`, or with
`expires_at` in the past, means `expired`; `completed_at` set with a live `s3_key` means `ready`;
`processing_started_at` set (and not yet completed/failed) means `processing`; otherwise `pending`.

## Export Statuses

- `pending`: Job has been enqueued but not started.
- `processing`: Job is running.
- `ready`: ZIP is available for download.
- `failed`: Export failed; the user can retry.
- `expired`: Download window has closed.

## API Endpoints

| Method | Route                                         | Description                                                                              |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/users/:idOrSlug/data-request`        | Create a new export request                                                              |
| `GET`  | `/api/v1/users/:idOrSlug/data-request`        | Get latest export status and `download_url`                                              |
| `GET`  | `/api/v1/users/:idOrSlug/data-request/stream` | Server-Sent Events stream of status until a terminal status (`ready`/`failed`/`expired`) |

Authorization: Users can only access their own requests; admins can access any user's requests.
