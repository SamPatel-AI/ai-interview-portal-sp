-- ============================================================
-- 020. ATOMIC FIRST-INVITE CLAIM ON APPLICATIONS
-- ============================================================
-- approve-interview guarded "invitation already sent" with a SELECT on
-- email_logs followed later by the INSERT — two concurrent clicks could both
-- pass the check and send two real emails. The endpoint now claims the
-- first-invite slot atomically (UPDATE ... WHERE invitation_sent_at IS NULL),
-- so it needs a column to claim. A unique index on invitation email_logs was
-- rejected because resend-invitation legitimately logs additional rows of
-- type 'invitation'.

ALTER TABLE applications ADD COLUMN invitation_sent_at TIMESTAMPTZ;

-- Backfill from history so already-invited applications are claimed.
UPDATE applications a
SET invitation_sent_at = e.first_sent
FROM (
    SELECT application_id, MIN(sent_at) AS first_sent
    FROM email_logs
    WHERE type = 'invitation' AND application_id IS NOT NULL
    GROUP BY application_id
) e
WHERE a.id = e.application_id;
