FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST_DIR=/app/frontend_dist

WORKDIR /app

RUN pip install --no-cache-dir pipenv

COPY Pipfile Pipfile.lock /app/
RUN pipenv sync --system --deploy

COPY backend /app/backend
COPY --from=frontend-build /frontend/dist /app/frontend_dist

EXPOSE 7860

CMD ["uvicorn", "backend.main:backend", "--host", "0.0.0.0", "--port", "7860"]
