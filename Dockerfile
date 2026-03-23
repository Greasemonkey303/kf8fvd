# syntax=docker/dockerfile:1.4
# Build a production image for Next.js
FROM cgr.dev/chainguard/wolfi-base:latest AS deps
WORKDIR /app

# Install the exact Node 20 toolchain and native build dependencies needed for
# Next.js production builds and sharp/libvips.
RUN apk add --no-cache \
	nodejs-20 \
	npm \
	python3 \
	build-base

COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS builder
WORKDIR /app

# Non-secret build args (optional)
ARG NODE_ENV=production
ARG DB_HOST
ARG DB_PORT
ARG DB_USER
ARG DB_PASSWORD
ARG DB_NAME
ARG REDIS_URL
ARG CSP_REPORT_ONLY=0
ARG CSP_ALLOW_INLINE=0
ARG NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
ARG NEXT_PUBLIC_MINIO_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG ENCRYPTION_KEY

# Copy source into build context
COPY . .

# Use BuildKit secrets for sensitive values during the build so they are not
# persisted in image layers. Create files at ./secrets/nextauth_secret and
# ./secrets/encryption_key (gitignore them) before building.
RUN --mount=type=secret,id=nextauth_secret \
	--mount=type=secret,id=encryption_key \
	--mount=type=secret,id=db_password \
	--mount=type=secret,id=redis_url \
	sh -c 'set -eu;\
		if [ -f ./.env.docker ]; then tr -d "\r" < ./.env.docker > /tmp/build.env; set -a; . /tmp/build.env; set +a; fi;\
		# If build-time secret files are mounted, read them; otherwise keep any provided build args or env vars.\
		if [ -f /run/secrets/nextauth_secret ]; then NEXTAUTH_SECRET=$(cat /run/secrets/nextauth_secret); fi;\
		if [ -f /run/secrets/encryption_key ]; then ENCRYPTION_KEY=$(cat /run/secrets/encryption_key); fi;\
		if [ -f /run/secrets/db_password ]; then DB_PASSWORD=$(cat /run/secrets/db_password); fi;\
		if [ -f /run/secrets/redis_url ]; then REDIS_URL=$(cat /run/secrets/redis_url); fi;\
		export CSP_REPORT_ONLY="${CSP_REPORT_ONLY:-}" CSP_ALLOW_INLINE="${CSP_ALLOW_INLINE:-}";\
		export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" NEXTAUTH_URL="${NEXTAUTH_URL:-}";\
		export NEXT_PUBLIC_CF_TURNSTILE_SITEKEY="${NEXT_PUBLIC_CF_TURNSTILE_SITEKEY:-}" NEXT_PUBLIC_MINIO_BASE_URL="${NEXT_PUBLIC_MINIO_BASE_URL:-}";\
		export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-}" ENCRYPTION_KEY="${ENCRYPTION_KEY:-}";\
		export NODE_ENV="${NODE_ENV:-production}" DB_HOST="${DB_HOST:-}" DB_PORT="${DB_PORT:-}" DB_USER="${DB_USER:-}";\
		export DB_PASSWORD="${DB_PASSWORD:-}" DB_NAME="${DB_NAME:-}" REDIS_URL="${REDIS_URL:-}";\
		npm run build'

FROM cgr.dev/chainguard/wolfi-base:latest AS runner
WORKDIR /app
RUN apk add --no-cache nodejs-20 npm
ENV NODE_ENV=production
ENV PORT=3000

# Copy runtime artifacts from earlier stages (native modules built in builder)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy Node-based entrypoint (reads /run/secrets and starts the app)
COPY --from=builder /app/scripts/docker-entrypoint.js /usr/local/bin/docker-entrypoint.js
# Ensure entrypoint has LF line endings inside the image (strip CR if present)
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.js || true
RUN chmod +x /usr/local/bin/docker-entrypoint.js || true

# Create a non-root runtime user and fix ownership for /app
RUN addgroup -S app \
	&& adduser -S -G app app \
	&& chown -R app:app /app /usr/local/bin/docker-entrypoint.js || true
USER app

ENV NPM_COMMAND=start

ENTRYPOINT ["node", "/usr/local/bin/docker-entrypoint.js"]

EXPOSE 3000
CMD ["npm","run","start"]

# Optional distroless target (build with: --target distroless-runner)
FROM cgr.dev/chainguard/wolfi-base:latest AS distroless-runner
WORKDIR /app
RUN apk add --no-cache nodejs-20 npm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/docker-entrypoint.js /usr/local/bin/docker-entrypoint.js
RUN true
