# syntax=docker/dockerfile:1.4
# Build a production image for Next.js
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Update OS packages and install build deps required by native modules (e.g. sharp)
# Running an upgrade here reduces known vulnerabilities in the image layers.
RUN apt-get update && apt-get upgrade -y && apt-get install -y python3 make g++ libc6-dev libvips-dev && rm -rf /var/lib/apt/lists/*

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
					 NEXTAUTH_SECRET="$NEXTAUTH_SECRET" ENCRYPTION_KEY="$ENCRYPTION_KEY" \
						 NODE_ENV="$NODE_ENV" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" \
						 DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" REDIS_URL="$REDIS_URL" npm run build'

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install runtime native deps and perform an upgrade to reduce OS-level vulnerabilities
RUN apt-get update && apt-get upgrade -y && apt-get install -y libvips-dev && rm -rf /var/lib/apt/lists/*

# Copy runtime artifacts from earlier stages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm","run","start"]
