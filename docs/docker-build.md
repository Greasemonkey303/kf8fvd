Docker build & run (BuildKit secrets)
===================================

This project uses BuildKit secret mounts so sensitive values (NEXTAUTH_SECRET, ENCRYPTION_KEY,
DB password, Redis URL) are available during `next build` but not persisted into image layers.

Quick steps (Windows PowerShell)
--------------------------------

1. Create secret files from `.env.docker`:

```powershell
npm run make:docker-secrets
```

2. Build with BuildKit enabled and run:

```powershell
$env:DOCKER_BUILDKIT=1
docker compose build --no-cache
docker compose up -d
```

Notes
-----
- The helper script `scripts/create_build_secrets_from_envdocker.js` reads `.env.docker` and
  writes `secrets/nextauth_secret`, `secrets/encryption_key`, `secrets/db_password` and
  `secrets/redis_url`. These files are ignored by git (see `.gitignore`).
- If you prefer not to keep secrets in `.env.docker`, create the `secrets/` files yourself.
- Alternatively, run `npm run build` locally (on host) and then use the runner stage only to
  avoid passing secrets into the image build process.
