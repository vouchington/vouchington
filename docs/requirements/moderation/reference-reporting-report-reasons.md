# Reporting & Content Moderation reference

[Back to Reporting & Content Moderation](REPORTING.md)

## Report reasons

| Value               | Label                                           |
| ------------------- | ----------------------------------------------- |
| `spam`              | Spam                                            |
| `harassment`        | Harassment                                      |
| `misinformation`    | Misinformation                                  |
| `illegal_content`   | Illegal content                                 |
| `vote_manipulation` | Vote manipulation — only valid for post reports |
| `other`             | Other                                           |

---

## Idempotency

One active pending report per reporter and target FK is enforced by partial unique indexes. A
duplicate submission updates the existing pending report's reason/note, returns HTTP 200 with the
existing report's ID, and does not create a duplicate row. A user report owned by a community
(`community_id`) is pending once per community. A user report with no operational community and no
transparency snapshot stays one pending row per reporter and user.

The web UI persists a `report:<entityType>:<entityId>=submitted` flag in `sessionStorage`. Native
clients render "Reported" for the current mounted detail session and reset that state when the
detail reloads or is discarded.

---
