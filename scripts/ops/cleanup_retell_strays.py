"""Delete stray/duplicate agents from the Retell account (dev-era leftovers:
'Saanvi Agent' x5, 'Saanvi Inbound Agent' x4, 'Custom LLM agent' x4).

SAFETY GUARDS — an agent is NEVER deleted if it is:
  1. one of the portal's three live agents (matched by retell_agent_id from
     the portal API), or
  2. bound to any Retell phone number (inbound/outbound agent id) — deleting
     the agent wired to the inbound number would break candidate callbacks.

Reads RETELL_API_KEY from backend/.env. Default is DRY RUN; pass --delete to
actually delete.

Run: PORTAL_ADMIN_EMAIL=... PORTAL_ADMIN_PASSWORD=... python3 cleanup_retell_strays.py [--delete]
"""
import urllib.request, urllib.error, json, sys, os

DELETE = "--delete" in sys.argv
BASE = os.environ.get("PORTAL_API_URL", "https://ai-interview-portal-sp-production-976b.up.railway.app")
EMAIL = os.environ.get("PORTAL_ADMIN_EMAIL") or sys.exit("set PORTAL_ADMIN_EMAIL")
PASSWORD = os.environ.get("PORTAL_ADMIN_PASSWORD") or sys.exit("set PORTAL_ADMIN_PASSWORD")

ENV_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend', '.env'))
env = {}
with open(ENV_PATH) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"')
RETELL_KEY = env['RETELL_API_KEY']
RH = {'Authorization': f'Bearer {RETELL_KEY}', 'Content-Type': 'application/json'}


def retell(method, path):
    req = urllib.request.Request(f"https://api.retellai.com{path}", headers=RH, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return json.loads(body) if body else None


def portal(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


# 1. The portal's live agent ids (protected)
login = portal("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
d = login["data"]
token = (d.get("session") or {}).get("access_token") or d.get("access_token")
ours = {a.get("retell_agent_id") for a in portal("GET", "/api/agents", token)["data"] if a.get("retell_agent_id")}
print(f"protected (portal agents): {len(ours)}")

# 2. Phone-number-bound agent ids (protected)
phone_bound = set()
for n in retell("GET", "/list-phone-numbers") or []:
    for k in ("inbound_agent_id", "outbound_agent_id"):
        if n.get(k):
            phone_bound.add(n[k])
    print(f"phone {n.get('phone_number')}: inbound={n.get('inbound_agent_id')} outbound={n.get('outbound_agent_id')}")
print(f"protected (phone-bound): {len(phone_bound)}")

# 3. Sweep (list-agents returns one row per agent VERSION — dedupe by id)
protected = ours | phone_bound
agents = retell("GET", "/list-agents")
seen: set = set()
strays = []
for a in agents:
    if a["agent_id"] in protected or a["agent_id"] in seen:
        continue
    seen.add(a["agent_id"])
    strays.append(a)
print(f"\nRetell agent rows: {len(agents)}; distinct stray agents: {len(strays)}")
for a in strays:
    label = f"{a.get('agent_name','?')} ({a['agent_id']})"
    if DELETE:
        try:
            retell("DELETE", f"/delete-agent/{a['agent_id']}")
            print(f"  deleted {label}")
        except urllib.error.HTTPError as e:
            print(f"  FAILED {label}: HTTP {e.code}")
    else:
        print(f"  would delete {label}")

if not DELETE:
    print("\nDry run only. Re-run with --delete to remove the strays above.")
