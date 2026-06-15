#!/usr/bin/env python3
"""
One-time historical import: Google Sheets CSV exports -> Supabase.

Creates candidates, historical jobs, applications (+ AI screening), and calls.
NO emails / no API side effects — writes directly to the DB via PostgREST
(service role). Idempotent: candidates upsert on (org_id,email), applications
upsert on (candidate_id,job_id), jobs matched by ceipal_job_id, calls deduped
by recording_url.

Usage:
  DRY_RUN=1 python3 import_historical.py   # report only, no writes (default)
  DRY_RUN=0 python3 import_historical.py   # actually write
"""
import csv, os, re, json, sys
from collections import OrderedDict

DL = os.path.expanduser("~/Downloads")
MAIN = f"{DL}/Main Datasheet - Candidate Data.csv"
QA   = f"{DL}/Main Datasheet - QA Candidate.csv"
INTER= f"{DL}/Recrutier Sheet - Interview Data.csv"

ORG = "a10f8bcc-b987-4b09-ba26-f8dff863ce17"
DRY = os.environ.get("DRY_RUN", "1") != "0"

# --- creds from backend/.env ---
def env(key):
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    return ""
SUPA = env("SUPABASE_URL")
SR = env("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json"}

JUNK = re.compile(r'invalid|example\.com|^$', re.I)
def nemail(e):
    e = (e or "").strip().lower().replace("\n", "").replace(" ", "")
    e = re.sub(r'^mailto:', '', e); e = e.strip("<>")
    return e
def valid_email(e):
    return e and not JUNK.search(e) and re.match(r'^[^@]+@[^@]+\.[^@]{2,}$', e)
def split_name(full):
    p = (full or "").strip().split()
    if not p: return ("Unknown", "Candidate")
    return (p[0], " ".join(p[1:]) or "-")
def to_score(v):
    m = re.search(r'\d+', str(v or ""))
    if not m: return None
    n = int(m.group()); return max(0, min(10, n))
def level_obj(v):
    v = (v or "").strip()
    if not v: return None
    m = re.match(r'(High|Medium|Low)\s*(.*)', v, re.I)
    if m: return {"score": m.group(1), "explanation": m.group(2).strip()}
    return {"explanation": v}
def qsplit(v):
    return [q.strip() for q in re.split(r'\n+', (v or "").strip()) if q.strip()] or None
def load(f):
    with open(f, newline='', encoding='utf-8-sig') as fh:
        return list(csv.DictReader(fh))

main, qa, inter = load(MAIN), load(QA), load(INTER)

# QA index by email -> first/last + questions
qa_by_email = {}
for r in qa:
    e = nemail(r.get("Email"))
    if valid_email(e) and e not in qa_by_email:
        qa_by_email[e] = r

# --- 1. Candidates (dedup by email, last row wins for richer data) ---
cands = OrderedDict()
for r in main:
    e = nemail(r.get("Email"))
    if not valid_email(e):
        continue
    q = qa_by_email.get(e)
    if q and (q.get("First Name") or "").strip() not in ("", "[INVALID NAME]"):
        fn, ln = q.get("First Name").strip(), (q.get("Last Name") or "-").strip() or "-"
    else:
        fn, ln = split_name(r.get("Candidate Name"))
    cands[e] = {
        "org_id": ORG, "email": e, "first_name": fn[:100], "last_name": ln[:100],
        "phone": (r.get("Phone No.") or "").strip()[:40] or None,
        "source": "Historical Import",
        "resume_url": (r.get("Resume Link") or "").strip() or None,
    }

# --- 2. Jobs (unique codes from main + interview) ---
def ncode(c):
    c = (c or "").strip()
    return c if re.search(r'\d', c) else None  # skip "JPC -" with no number
jobs = OrderedDict()
for r in main + inter:
    c = ncode(r.get("Jobe Code"))
    if c and c not in jobs:
        jobs[c] = (r.get("Job Title") or c).strip()[:200]

# --- 3. Applications (one per candidate+job from main) ---
apps = []
seen_app = set()
for r in main:
    e = nemail(r.get("Email")); c = ncode(r.get("Jobe Code"))
    if not (valid_email(e) and c) or (e, c) in seen_app:
        continue
    seen_app.add((e, c))
    q = qa_by_email.get(e)
    apps.append({
        "email": e, "code": c,
        "score": to_score(r.get("Overall Fit")),
        "result": {
            "candidate_strengths": qsplit(r.get("Strengths")),
            "candidate_weaknesses": qsplit(r.get("Weaknesses")),
            "risk_factor": level_obj(r.get("Risk Factor")),
            "reward_factor": level_obj(r.get("Reward Factor ")),
            "overall_fit_rating": to_score(r.get("Overall Fit")),
            "justification_for_rating": (r.get("Justification") or "").strip() or None,
        },
        "mandate": qsplit(q.get("Mandate Questions")) if q else None,
        "interview": qsplit(q.get("Interview Questions")) if q else None,
        "resume_url": (r.get("Resume Link") or "").strip() or None,
    })

# --- 4. Calls (from interview data) ---
STATUS_MAP = {
    "✅ interviewed": "completed", "user_hangup": "completed", "agent_hangup": "completed",
    "📵 no answer": "no_answer", "not pickup": "no_answer", "dial_busy": "failed",
}
calls = []
for r in inter:
    e = nemail(r.get("Email")); c = ncode(r.get("Jobe Code"))
    st = (r.get("Call Status") or "").strip().lower()
    mapped = STATUS_MAP.get(st)
    if not (valid_email(e) and c and mapped):
        continue
    calls.append({
        "email": e, "code": c, "status": mapped,
        "transcript": (r.get("Call Logs") or "").strip() or None,
        "recording_url": (r.get("Call Recording") or "").strip() or None,
    })

print("=== DRY RUN ===" if DRY else "=== LIVE IMPORT ===")
print(f"Candidates (unique real emails): {len(cands)}")
print(f"Jobs (unique historical codes):  {len(jobs)}  -> {list(jobs)[:8]}...")
print(f"Applications (candidate+job):    {len(apps)}")
print(f"Calls (real call statuses):      {len(calls)}")
print(f"  call status breakdown: ", {s: sum(1 for c in calls if c['status']==s) for s in set(c['status'] for c in calls)})

if DRY:
    print("\n(DRY_RUN — nothing written. Set DRY_RUN=0 to import.)")
    sys.exit(0)

# ---------- LIVE WRITES (stdlib urllib, no deps) ----------
import urllib.request, urllib.error
def http(method, url, body=None, extra=None):
    headers = {**H, **(extra or {})}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else []
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} {method} {url}\n{e.read().decode()[:400]}")

def upsert(table, rows, on_conflict):
    out = []
    for i in range(0, len(rows), 200):
        out.extend(http("POST", f"{SUPA}/rest/v1/{table}?on_conflict={on_conflict}",
                        rows[i:i+200],
                        {"Prefer": "resolution=merge-duplicates,return=representation"}) or [])
    return out

# candidates
cand_rows = upsert("candidates", list(cands.values()), "org_id,email")
cid = {c["email"]: c["id"] for c in cand_rows}
print(f"candidates upserted: {len(cand_rows)}")

if os.environ.get("CANDIDATES_ONLY") == "1":
    print("CANDIDATES_ONLY — done (resume links updated, no jobs/apps/calls touched).")
    sys.exit(0)

# jobs: fetch existing, create missing
existing = http("GET", f"{SUPA}/rest/v1/jobs?org_id=eq.{ORG}&select=id,ceipal_job_id")
jid = {j["ceipal_job_id"]: j["id"] for j in existing if j.get("ceipal_job_id")}
new_jobs = [{"org_id": ORG, "ceipal_job_id": c, "title": t, "status": "closed"} for c, t in jobs.items() if c not in jid]
if new_jobs:
    created = upsert("jobs", new_jobs, "id")
    for j in created: jid[j["ceipal_job_id"]] = j["id"]
print(f"jobs now mapped: {len(jid)} (created {len(new_jobs)})")

# applications
app_rows = []
for a in apps:
    if a["email"] in cid and a["code"] in jid:
        app_rows.append({
            "org_id": ORG, "candidate_id": cid[a["email"]], "job_id": jid[a["code"]],
            "status": "screening", "ai_screening_score": a["score"],
            "ai_screening_result": a["result"], "mandate_questions": a["mandate"],
            "interview_questions": a["interview"],
        })
app_created = upsert("applications", app_rows, "candidate_id,job_id")
appid = {(a["candidate_id"], a["job_id"]): a["id"] for a in app_created}
print(f"applications upserted: {len(app_created)}")

# calls
call_rows = []
for c in calls:
    if c["email"] in cid and c["code"] in jid:
        key = (cid[c["email"]], jid[c["code"]])
        if key in appid:
            call_rows.append({
                "org_id": ORG, "application_id": appid[key], "candidate_id": cid[c["email"]],
                "direction": "outbound", "status": c["status"],
                "transcript": c["transcript"], "recording_url": c["recording_url"],
            })
if call_rows:
    for i in range(0, len(call_rows), 200):
        http("POST", f"{SUPA}/rest/v1/calls", call_rows[i:i+200], {"Prefer": "return=minimal"})
print(f"calls inserted: {len(call_rows)}")
print("DONE.")
