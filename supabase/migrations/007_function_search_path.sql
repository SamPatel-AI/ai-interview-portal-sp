-- ============================================================================
-- Migration 007: Pin search_path on SECURITY DEFINER / trigger functions
--
-- Clears the two `function_search_path_mutable` advisor warnings by pinning the
-- search_path so the functions can't be hijacked by a malicious search_path.
-- ============================================================================

ALTER FUNCTION public.get_user_org_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
