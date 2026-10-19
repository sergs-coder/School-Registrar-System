# Single-service demo image: the API serves the built frontend from the same origin.
# Used by render.yaml. Local development uses docker-compose.yml instead.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STATIC_DIR=/app/static
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend /frontend/dist /app/static
EXPOSE 8000
# Demo deploy: every start loads fresh demo data into a local SQLite database.
# Render sets PORT and RENDER_EXTERNAL_URL.
CMD ["sh", "-c", "export FRONTEND_URL=${FRONTEND_URL:-$RENDER_EXTERNAL_URL}; python -m app.seed.seed --reset && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
