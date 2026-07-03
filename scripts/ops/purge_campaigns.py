"""Purge ALL reengagement_campaigns (junk from the runaway sweep) in time-window
batches. Children cascade via FK. Windows shrink on failure/timeout."""
import urllib.request, urllib.error, time, sys, os
from datetime import datetime, timedelta, timezone

# Locate backend/.env relative to this script (scripts/ops/ → repo root) so
# the script works from ANY working directory.
ENV_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend', '.env'))
if not os.path.exists(ENV_PATH):
    sys.exit(f"backend/.env not found at {ENV_PATH}")

env = {}
with open(ENV_PATH) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"')

URL = env['SUPABASE_URL']; KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def req(method, path, extra=None, tries=3):
    for i in range(tries):
        try:
            r = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
                                       headers={**H, **(extra or {})})
            with urllib.request.urlopen(r, timeout=120) as resp:
                return resp.status, resp.headers.get('Content-Range')
        except urllib.error.HTTPError as e:
            if i == tries - 1:
                return e.code, None
            time.sleep(3)
        except Exception:
            if i == tries - 1:
                return -1, None
            time.sleep(3)

def count():
    _, cr = req('HEAD', 'reengagement_campaigns?select=id',
                {'Prefer': 'count=exact', 'Range': '0-0'})
    return int(cr.split('/')[1]) if cr and '/' in cr else -1

start_total = count()
print(f"START: {start_total} campaigns", flush=True)

# Sweep windows: from before the import (June 14) to past the last sweep run.
cur = datetime(2026, 6, 14, tzinfo=timezone.utc)
end = datetime(2026, 7, 4, tzinfo=timezone.utc)
window = timedelta(hours=6)

def ts(dt):
    # PostgREST query values must not contain a raw '+' (decodes to a space) —
    # use the Z suffix instead of +00:00.
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')

deleted_windows = 0
while cur < end:
    hi = min(cur + window, end)
    path = (f"reengagement_campaigns?created_at=gte.{ts(cur)}"
            f"&created_at=lt.{ts(hi)}")
    status, _ = req('DELETE', path)
    if status in (200, 204):
        deleted_windows += 1
        cur = hi
        if window < timedelta(hours=6):
            window = min(window * 2, timedelta(hours=6))  # grow back
    else:
        if window <= timedelta(minutes=15):
            print(f"FAILED window {cur} (+15m), status {status}; skipping", flush=True)
            cur = cur + timedelta(minutes=15)
        else:
            window = window / 2  # shrink and retry
    if deleted_windows % 10 == 0 and deleted_windows:
        print(f"  ...{deleted_windows} windows done, at {cur}", flush=True)

final = count()
print(f"DONE: {final} campaigns remain (was {start_total})", flush=True)
sys.exit(0 if final >= 0 else 1)
