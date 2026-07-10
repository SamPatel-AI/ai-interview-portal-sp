-- ============================================================
-- 019. DEDUPLICATE CEIPAL JOBS + UNIQUE INDEX
-- ============================================================
-- The CEIPAL sync used a non-atomic check-then-insert with no DB-level
-- uniqueness guard, so concurrent runs (manual sync racing the 30-min
-- scheduled one) could create duplicate rows per (org_id, ceipal_job_id).
-- Worse, once two rows existed the sync's .single() existence check errored,
-- sending every later run down the insert branch — duplicates compounded on
-- every sync. This migration merges the duplicates (keeping the earliest row
-- per job code) and adds the unique index the sync's upsert now relies on.

-- Postings without a job code were stored with '' — normalize to NULL so
-- distinct codeless jobs don't collide under the unique index (NULLs stay
-- distinct). The sync now skips codeless postings entirely.
UPDATE jobs SET ceipal_job_id = NULL WHERE ceipal_job_id = '';

-- Every row that is not the earliest for its (org_id, ceipal_job_id).
CREATE TEMP TABLE _dupe_jobs AS
SELECT id, keep_id
FROM (
    SELECT id,
           first_value(id) OVER (PARTITION BY org_id, ceipal_job_id
                                 ORDER BY created_at, id) AS keep_id
    FROM jobs
    WHERE ceipal_job_id IS NOT NULL
) ranked
WHERE id <> keep_id;

-- A candidate with an application on both copies keeps the one on the
-- surviving job (applications are UNIQUE(candidate_id, job_id)); the copy on
-- the duplicate job — and its calls/evaluations — goes with it via CASCADE.
DELETE FROM applications a
USING _dupe_jobs d
WHERE a.job_id = d.id
  AND EXISTS (
      SELECT 1 FROM applications k
      WHERE k.job_id = d.keep_id AND k.candidate_id = a.candidate_id
  );

UPDATE applications a SET job_id = d.keep_id
FROM _dupe_jobs d
WHERE a.job_id = d.id;

-- Stages collide on UNIQUE(job_id, stage_number): the survivor's stage wins;
-- a duplicate job's colliding stage falls to the CASCADE delete below.
UPDATE interview_stages s SET job_id = d.keep_id
FROM _dupe_jobs d
WHERE s.job_id = d.id
  AND NOT EXISTS (
      SELECT 1 FROM interview_stages k
      WHERE k.job_id = d.keep_id AND k.stage_number = s.stage_number
  );

UPDATE reengagement_campaigns c SET job_id = d.keep_id
FROM _dupe_jobs d
WHERE c.job_id = d.id;

DELETE FROM jobs j
USING _dupe_jobs d
WHERE j.id = d.id;

DROP TABLE _dupe_jobs;

-- Manually created jobs keep ceipal_job_id NULL and are unaffected (NULLs are
-- distinct). Deliberately NOT a partial index: supabase-js upsert can only
-- name conflict columns, and ON CONFLICT cannot infer a partial index without
-- its WHERE predicate.
CREATE UNIQUE INDEX idx_jobs_org_ceipal_unique ON jobs (org_id, ceipal_job_id);
