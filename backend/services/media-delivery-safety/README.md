# Media delivery safety

## Copyright notice locks

Before an image is proven deliverable and published to the edge, `lockImageDeliveryLegalAuthority`
takes `FOR NO KEY UPDATE` on every `copyright_notices` row that targets that one placement. Filing a
notice takes the same lock, so a notice cannot be admitted between the authority proof and the
provider publication, and a withheld image is never republished by a racing delivery.

The lock set is the notices targeting a single placement: normally none, and one or two when an image
has been reported. A placement with many notices is an edge case (repeated reports of one image), so
the statement is allowed in `postgres-bounded-statements` with a reason instead of a row cap. A cap
would let an unlocked notice slip past the proof.
