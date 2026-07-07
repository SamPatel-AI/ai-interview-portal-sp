-- Migration 018: scrub PII from orphaned ceipal_submissions rows.
--
-- Candidate erasure (DELETE /api/candidates/:id) now scrubs a candidate's
-- ceipal_submissions rows (raw email payload can carry the candidate's name in
-- the subject; error is free-form) before deleting the candidate row. Rows
-- orphaned by erasures that ran BEFORE that fix still hold the payload —
-- candidate_id IS NULL means erased or never-linked, and dedup only needs
-- ceipal_submission_id + status, so clearing these is safe.

UPDATE ceipal_submissions
SET raw = NULL, error = NULL
WHERE candidate_id IS NULL;
