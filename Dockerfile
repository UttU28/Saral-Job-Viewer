# Build:  docker build -t saral-dvalidate .
#          Requires a `.env` file in the build context (repo root). Secrets end up in image layers — fine for private dev; use runtime `-e` / Secret Manager for prod.
# Run:    docker run --rm saral-dvalidate
# Or:     docker run --rm -e MONGODB_URI="..." -e MONGODB_DATABASE=... -e MIDHTECH_EMAIL=... -e MIDHTECH_PASSWORD=... saral-dvalidate
# Shell:  docker run --rm -it --env-file .env saral-dvalidate -4
#
# Default command: python dValidate.py -1  (validate pending; then exit)
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

RUN pip install --upgrade pip \
    && pip install \
        "python-dotenv>=1.0.0,<2" \
        "requests>=2.31.0,<3" \
        "pymongo>=4.6,<5" \
        "dnspython>=2.0.0,<3"

COPY utils/ ./utils/
COPY dValidate.py .
COPY .env ./
COPY .env.example ./

# load_dotenv reads /app/.env; runtime `-e` / `--env-file` still overrides when variables are set first (override=False)

ENTRYPOINT ["python", "dValidate.py"]
CMD ["-1"]
