# syntax=docker/dockerfile:1.4
# Build a production image for Next.js
FROM node:20-bullseye-slim AS deps
WORKDIR /app

# Update OS packages and install build deps required by native modules (e.g. sharp)
# Running an upgrade here reduces known vulnerabilities in the image layers.
RUN apt-get update && apt-get upgrade -y \
	&& apt-get install -y --no-install-recommends python3 make g++ libc6-dev libvips-dev \
	&& rm -rf /var/lib/apt/lists/*

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

# Copy source into build context
COPY . .

# Use BuildKit secrets for sensitive values during the build so they are not
# persisted in image layers. Create files at ./secrets/nextauth_secret and
# ./secrets/encryption_key (gitignore them) before building.
RUN --mount=type=secret,id=nextauth_secret \
	--mount=type=secret,id=encryption_key \
	--mount=type=secret,id=db_password \
	--mount=type=secret,id=redis_url \
	sh -c 'export NEXTAUTH_SECRET=$(cat /run/secrets/nextauth_secret) && \
			 export ENCRYPTION_KEY=$(cat /run/secrets/encryption_key) && \
			 export DB_PASSWORD=$(cat /run/secrets/db_password) && \
			 export REDIS_URL=$(cat /run/secrets/redis_url) && \
			 export CSP_REPORT_ONLY="$CSP_REPORT_ONLY" && export CSP_ALLOW_INLINE="$CSP_ALLOW_INLINE" && \
			 export NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" && export NEXTAUTH_URL="$NEXTAUTH_URL" && \
			 export NEXT_PUBLIC_CF_TURNSTILE_SITEKEY="$NEXT_PUBLIC_CF_TURNSTILE_SITEKEY" && export NEXT_PUBLIC_MINIO_BASE_URL="$NEXT_PUBLIC_MINIO_BASE_URL" && \
			 NEXTAUTH_SECRET="$NEXTAUTH_SECRET" ENCRYPTION_KEY="$ENCRYPTION_KEY" \
			 NODE_ENV="$NODE_ENV" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" \
			 DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" REDIS_URL="$REDIS_URL" \
			 NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" NEXTAUTH_URL="$NEXTAUTH_URL" NEXT_PUBLIC_CF_TURNSTILE_SITEKEY="$NEXT_PUBLIC_CF_TURNSTILE_SITEKEY" NEXT_PUBLIC_MINIO_BASE_URL="$NEXT_PUBLIC_MINIO_BASE_URL" npm run build'

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy runtime artifacts from earlier stages (native modules built in builder)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy Node-based entrypoint (reads /run/secrets and starts the app)
COPY --from=builder /app/scripts/docker-entrypoint.js /usr/local/bin/docker-entrypoint.js
RUN chmod +x /usr/local/bin/docker-entrypoint.js || true

# Create a non-root runtime user and fix ownership for /app
RUN groupadd -r app \
	&& useradd -r -g app app \
	&& chown -R app:app /app /usr/local/bin/docker-entrypoint.js || true
USER app

ENV NPM_COMMAND=start

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.js"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "require('http').get('http://127.0.0.1:3000', res=>{process.exit(res.statusCode===200?0:1)}).on('error', ()=>process.exit(1))"

CMD ["npm","run","start"]

# Optional distroless target (build with: --target distroless-runner)
FROM gcr.io/distroless/nodejs:20 AS distroless-runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/docker-entrypoint.js /usr/local/bin/docker-entrypoint.js
RUN true
