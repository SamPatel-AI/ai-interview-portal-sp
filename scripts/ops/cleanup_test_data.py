"""One-time pre-handoff cleanup of test rows left in prod by dry runs.

Deletes (via the deployed API, so org scoping + cascades + storage cleanup all
apply — requires PR #33's DELETE endpoint to be deployed):
  - known test candidates (dry-run rows + Sam Patel test rows)
  - test "Web Developer" jobs created during pipeline testing
  - marks the known orphaned call row as failed

Run: PORTAL_ADMIN_EMAIL=... PORTAL_ADMIN_PASSWORD=... python3 cleanup_test_data.py
Add --dry-run to only list what would be deleted.
"""
import urllib.request, urllib.error, json, sys, os

BASE = os.environ.get("PORTAL_API_URL", "https://ai-interview-portal-sp-production-976b.up.railway.app")
EMAIL = os.environ.get("PORTAL_ADMIN_EMAIL") or sys.exit("set PORTAL_ADMIN_EMAIL")
PASSWORD = os.environ.get("PORTAL_ADMIN_PASSWORD") or sys.exit("set PORTAL_ADMIN_PASSWORD")
DRY = "--dry-run" in sys.argv

# Known test data (documented in docs/audits + memory, June/July dry runs)
TEST_CANDIDATE_EMAILS = [
    "aiwithsampatel@gmail.com",        # Sam Patel live-call test (2026-06-17)
    "test-pipeline@example.com",
    # dry-run candidates used example.com addresses with a timestamp:
]
TEST_CANDIDATE_EMAIL_PREFIXES = ["dryrun-"]
TEST_JOB_TITLES = ["Web Developer"]   # created by test scripts only
ORPHAN_CALL_ID = "6feaa3b1"           # prefix — resolved to full id below


def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"  {method} {path} -> HTTP {e.code}: {e.read().decode()[:200]}")
        return None


login = api("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
d = login["data"]
token = (d.get("session") or {}).get("access_token") or d.get("access_token")

# ── candidates ──
deleted = 0
page = 1
victims = []
while True:
    res = api("GET", f"/api/candidates?page={page}&limit=100", token)
    if not res or not res["data"]:
        break
    for c in res["data"]:
        email = (c.get("email") or "").lower()
        if email in [e.lower() for e in TEST_CANDIDATE_EMAILS] or any(
            email.startswith(p) for p in TEST_CANDIDATE_EMAIL_PREFIXES
        ):
            victims.append((c["id"], email))
    if page >= res.get("totalPages", 1):
        break
    page += 1

print(f"test candidates found: {len(victims)}")
for cid, email in victims:
    print(f"  {'would delete' if DRY else 'deleting'} candidate {cid} <{email}>")
    if not DRY:
        r = api("DELETE", f"/api/candidates/{cid}", token)
        if r and r.get("success"):
            deleted += 1
print(f"candidates deleted: {deleted}")

# ── jobs ──
from urllib.parse import quote
res = api("GET", f"/api/jobs?days=all&limit=100&search={quote('Web Developer')}", token)
jobs = [j for j in (res["data"] if res else []) if j.get("title") in TEST_JOB_TITLES and not j.get("ceipal_job_id")]
print(f"test jobs found (non-CEIPAL '{TEST_JOB_TITLES}'): {len(jobs)}")
for j in jobs:
    print(f"  {'would delete' if DRY else 'deleting'} job {j['id']} \"{j['title']}\"")
    if not DRY:
        api("DELETE", f"/api/jobs/{j['id']}", token)

print("done. Orphan call row: if calls list still shows an in_progress call "
      f"starting {ORPHAN_CALL_ID}…, mark it failed from the Calls page (or SQL).")
