# syntax=docker/dockerfile:1.4
# Build a production image for Next.js
FROM cgr.dev/chainguard/wolfi-base@sha256:1454fe554abc89f10a43cabc290d8d61941d7e81c9778b408894aaba27d398a1 AS deps
WORKDIR /app

# Install the exact Node 20 toolchain and native build dependencies needed for
# Next.js production builds and sharp/libvips.
RUN apk add --no-cache \
	nodejs-20 \
	npm \
	python3 \
	build-base

COPY package.json package-lock.json* ./
RUN HUSKY=0 npm ci

FROM deps AS builder
WORKDIR /app

# Non-secret build args (optional)
ARG NODE_ENV=production
ARG NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
ARG NEXT_PUBLIC_MINIO_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_S3_BUCKET
ARG NEXT_PUBLIC_UMAMI_HOST_URL
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_UMAMI_DOMAINS

# Copy source into build context
COPY . .

# Build with public values only. Runtime secrets are never passed to this stage.
RUN NODE_ENV="${NODE_ENV}" \
	NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}" \
	NEXT_PUBLIC_CF_TURNSTILE_SITEKEY="${NEXT_PUBLIC_CF_TURNSTILE_SITEKEY}" \
	NEXT_PUBLIC_MINIO_BASE_URL="${NEXT_PUBLIC_MINIO_BASE_URL}" \
	NEXT_PUBLIC_S3_BUCKET="${NEXT_PUBLIC_S3_BUCKET}" \
	NEXT_PUBLIC_UMAMI_HOST_URL="${NEXT_PUBLIC_UMAMI_HOST_URL}" \
	NEXT_PUBLIC_UMAMI_SCRIPT_URL="${NEXT_PUBLIC_UMAMI_SCRIPT_URL}" \
	NEXT_PUBLIC_UMAMI_WEBSITE_ID="${NEXT_PUBLIC_UMAMI_WEBSITE_ID}" \
	NEXT_PUBLIC_UMAMI_DOMAINS="${NEXT_PUBLIC_UMAMI_DOMAINS}" \
	npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev --ignore-scripts

FROM cgr.dev/chainguard/wolfi-base@sha256:1454fe554abc89f10a43cabc290d8d61941d7e81c9778b408894aaba27d398a1 AS runner
WORKDIR /app
RUN apk add --no-cache nodejs-20
ENV NODE_ENV=production
ENV PORT=3000

# Copy only standalone runtime artifacts and public/static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

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

ENTRYPOINT ["node", "/usr/local/bin/docker-entrypoint.js"]

EXPOSE 3000
CMD ["node", "server.js"]

FROM cgr.dev/chainguard/wolfi-base@sha256:1454fe554abc89f10a43cabc290d8d61941d7e81c9778b408894aaba27d398a1 AS ops
WORKDIR /app
RUN apk add --no-cache nodejs-20
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY scripts ./scripts
ENTRYPOINT ["node"]
