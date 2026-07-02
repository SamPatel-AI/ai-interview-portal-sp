"""Update the 3 prod agents with named personas + scripted greetings/closings,
then verify they re-synced to Retell (which also refreshes the webhook URL to
the new Railway domain). PATCH requires the FULL agent body, so we GET each
agent first and only change the persona fields.

Run: PORTAL_ADMIN_EMAIL=... PORTAL_ADMIN_PASSWORD=... python3 update_agent_personas.py
"""
import urllib.request, urllib.error, json, sys, os

BASE = os.environ.get(
    "PORTAL_API_URL",
    "https://ai-interview-portal-sp-production-976b.up.railway.app",
)
EMAIL = os.environ.get("PORTAL_ADMIN_EMAIL") or sys.exit("set PORTAL_ADMIN_EMAIL")
PASSWORD = os.environ.get("PORTAL_ADMIN_PASSWORD") or sys.exit("set PORTAL_ADMIN_PASSWORD")

# name-match → persona fields. Greetings ship verbatim as the Retell
# begin_message (dynamic {{vars}} are filled per call).
PERSONAS = {
    "General Screening Interviewer": {
        "interviewer_persona": (
            "You are Grace, a warm, experienced recruiter at Saanvi Technology. "
            "You put candidates at ease quickly and keep the conversation moving "
            "without ever feeling rushed."
        ),
        "greeting": (
            "Hi, this is Grace calling from Saanvi Technology about the "
            "{{job_title}} position you applied for. Am I speaking with "
            "{{candidate_first_name}}?"
        ),
        "closing": (
            "Thanks so much for your time today, {{candidate_first_name}}. "
            "Our recruitment team will review your interview and reach out about "
            "next steps within two business days. Have a great rest of your day!"
        ),
    },
    "Technical Deep-Dive Interviewer": {
        "interviewer_persona": (
            "You are Adrian, a senior engineer at Saanvi Technology who conducts "
            "technical screens. You are curious and direct, probe for real depth "
            "behind every claim, and respect the candidate's time."
        ),
        "greeting": (
            "Hi, this is Adrian from Saanvi Technology — I'm calling for the "
            "technical interview for the {{job_title}} role. Am I speaking with "
            "{{candidate_first_name}}?"
        ),
        "closing": (
            "That's everything from my side, {{candidate_first_name}} — thanks "
            "for walking me through your experience. The team will review this "
            "round and get back to you about next steps within two business days. "
            "Take care!"
        ),
    },
    "Formal / Compliance Screener": {
        "interviewer_persona": (
            "You are Brian, a professional and composed screening specialist at "
            "Saanvi Technology. You are courteous and precise, with clear "
            "transitions between topics — thorough, never stiff."
        ),
        "greeting": (
            "Good day, this is Brian calling on behalf of Saanvi Technology "
            "regarding your application for the {{job_title}} position. "
            "Am I speaking with {{candidate_first_name}}?"
        ),
        "closing": (
            "Thank you for your time and your thorough answers, "
            "{{candidate_first_name}}. Your interview will be reviewed by our "
            "recruitment team, and you can expect to hear about next steps within "
            "two business days. Have a good day."
        ),
    },
}

AGENT_BODY_FIELDS = [
    "name", "client_company_id", "voice_id", "language", "interview_style",
    "max_call_duration_sec", "evaluation_criteria", "greeting_template",
    "closing_template", "is_active", "builder_config",
]

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
        print(f"  {method} {path} -> HTTP {e.code}: {e.read().decode()[:300]}")
        return None

resp = api("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
if not resp:
    sys.exit("login failed")
data = resp.get("data", {})
token = (data.get("session") or {}).get("access_token") or data.get("access_token")
if not token:
    sys.exit(f"no token in login response: {list(data.keys())}")

agents = api("GET", "/api/agents", token)["data"]
print(f"{len(agents)} agents found")

for a in agents:
    persona = PERSONAS.get(a["name"])
    if not persona:
        print(f"SKIP {a['name']} (no persona mapping)")
        continue
    detail = api("GET", f"/api/agents/{a['id']}", token)["data"]
    bc = detail.get("builder_config")
    if not bc:
        print(f"SKIP {a['name']}: not a guided agent (no builder_config)")
        continue
    bc.update(persona)
    body = {k: detail[k] for k in AGENT_BODY_FIELDS if detail.get(k) is not None}
    body["builder_config"] = bc
    updated = api("PATCH", f"/api/agents/{a['id']}", token, body)
    if updated:
        u = updated["data"]
        print(f"{a['name']}: sync_status={u.get('sync_status')} "
              f"synced_at={u.get('last_synced_at')} error={u.get('sync_error')}")

print("\nDone. All three should show sync_status=synced.")
print("Verify in the Retell dashboard that each agent's Webhook URL is:")
print(f"  {BASE}/api/webhooks/retell/post-call")
