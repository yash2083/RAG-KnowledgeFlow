.PHONY: up down build logs backend frontend test lint seed

# ── Docker stack ─────────────────────────────────────────────────────────────
up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f backend

build:
	docker compose build

restart-backend:
	docker compose restart backend

# ── Local dev ────────────────────────────────────────────────────────────────
backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

# ── Database ─────────────────────────────────────────────────────────────────
migrate:
	cd backend && alembic upgrade head

migration:
	cd backend && alembic revision --autogenerate -m "$(m)"

# ── Tests ─────────────────────────────────────────────────────────────────────
test:
	cd backend && pytest tests/ -v

test-coverage:
	cd backend && pytest tests/ --cov=app --cov-report=html -v

# ── Admin ─────────────────────────────────────────────────────────────────────
promote-admin:
	docker compose exec postgres psql -U postgres -d knowledgeflow \
		-c "UPDATE users SET is_admin=true WHERE email='$(email)';"

# ── Seed data ─────────────────────────────────────────────────────────────────
seed:
	@echo "Seeding sample ML curriculum..."
	@TOKEN=$$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-d '{"email":"admin@example.com","password":"adminpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"); \
	curl -s -X POST http://localhost:8000/api/v1/ingestion/text \
		-H "Authorization: Bearer $$TOKEN" \
		-F "document_name=ML Fundamentals" \
		-F "domain=machine-learning" \
		-F "difficulty=2" \
		-F "content=Machine learning is a subset of artificial intelligence. Linear regression predicts continuous outputs. Gradient descent is an optimization algorithm that minimizes a loss function by iteratively moving in the direction of steepest descent. Backpropagation computes gradients in neural networks using the chain rule. A neural network consists of layers of neurons with activation functions. Overfitting occurs when a model learns noise in training data."
	@echo "\nSeed complete."

# ── Lint ─────────────────────────────────────────────────────────────────────
lint:
	cd backend && ruff check app/
	cd frontend && npm run lint

format:
	cd backend && ruff format app/
