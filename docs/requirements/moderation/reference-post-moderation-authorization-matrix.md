# Post Moderation reference

[Back to Post Moderation](POST-MODERATION.md)

## Authorization Matrix

| Action                               | Global post               | Community post (non-comment)             | Community comment                            |
| ------------------------------------ | ------------------------- | ---------------------------------------- | -------------------------------------------- |
| Create                               | Any signed-in (per gates) | Community member or admin                | Any signed-in viewing the thread             |
| Edit content (≤1 day)                | Author, Admin             | Author, Admin                            | Author, Admin                                |
| Edit content (>1 day)                | Admin only                | Admin only                               | Admin only                                   |
| Hard delete                          | Author, Admin             | Author, Admin                            | **Author, Admin, Community owner/moderator** |
| Unpublish from community             | n/a                       | Community owner/moderator, Admin         | n/a                                          |
| Archive / Unarchive                  | Author, Admin             | Author, Admin                            | Author, Admin                                |
| Approve / Reject pending             | Admin                     | Community owner/moderator, Admin         | n/a                                          |
| Pin (≤3)                             | n/a                       | Community owner/moderator, Admin         | n/a                                          |
| Clearance (approve/reject/in_review) | Admin                     | Admin                                    | Admin                                        |
| Report                               | Any signed-in             | Any signed-in                            | Any signed-in                                |
| View agent moderation results        | Owner, Admin              | Community owner/mod, Plus+ member, Admin | Community owner/mod, Plus+ member, Admin     |
