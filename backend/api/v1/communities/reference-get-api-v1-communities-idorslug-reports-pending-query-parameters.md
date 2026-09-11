# GET /api/v1/communities/:idOrSlug/reports/pending Query Parameters

[Back to Communities API](README.md#get-apiv1communitiesidorslugreportspending-query-parameters)

| Parameter | Type                                                                   | Default    | Description                                                                    |
| --------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `limit`   | integer 1–100                                                          | `50`       | Max pending reports returned                                                   |
| `after`   | opaque cursor                                                          | —          | Continue from `page_info.end_cursor`; scoped to this community, role, and sort |
| `sort`    | `severity` \| `most_reported` \| `created_at_asc` \| `created_at_desc` | `severity` | Report ordering; severity uses latest judgement then report count then age     |

The response includes `page_info`. The cursor contains every sort key plus the report UUID
tie-breaker and is rejected if replayed with another community, authorization role, or sort.

Community report responses omit reporter identity, reporter notes, note-derived AI judgements, and community ban-evasion context for community owners/moderators who are not site staff. Site staff retain those fields. Community owners/moderators may dismiss redacted ban-evasion flags, but confirming a ban-evasion flag is staff-only because it acts on withheld evidence.
