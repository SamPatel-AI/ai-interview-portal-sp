# Interview Portal — Development Commands

# ─── Setup ──────────────────────────────────────────────────
setup:
	cd frontend && npm install
	cd backend && npm install

# ─── Development ────────────────────────────────────────────
up:
	@echo "Starting backend on :3001 and frontend on :8082..."
	cd backend && npm run dev &
	cd frontend && npm run dev &

down:
	@lsof -ti :3001 | xargs kill -9 2>/dev/null || true
	@lsof -ti :8082 | xargs kill -9 2>/dev/null || true
	@echo "Servers stopped."

# ─── Code Quality ───────────────────────────────────────────
validate: type-check lint
	@echo "All checks passed."

type-check:
	cd frontend && npx tsc --noEmit
	cd backend && npx tsc --noEmit

lint:
	cd frontend && npm run lint

build:
	cd frontend && npm run build
	cd backend && npm run build

# ─── Database ───────────────────────────────────────────────
seed:
	cd backend && npx tsx src/seed.ts

# ─── Shortcuts ──────────────────────────────────────────────
fe-dev:
	cd frontend && npm run dev

be-dev:
	cd backend && npm run dev

.PHONY: setup up down validate type-check lint build seed fe-dev be-dev
