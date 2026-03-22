BuildKit & runtime secrets
===========================

This project already uses BuildKit secret mounts during the build stage and an entrypoint that reads `/run/secrets/*` at runtime.

Recommended steps to formalize secrets for CI/CD and production:

- Build with BuildKit and pass secrets (example):

  docker build --secret id=nextauth_secret,src=./secrets/nextauth_secret \
    --secret id=encryption_key,src=./secrets/encryption_key \
    --secret id=db_password,src=./secrets/db_password \
    -t myapp:latest .

- In Kubernetes or Docker Swarm, mount secrets to `/run/secrets/` path so the container entrypoint can read them. The included `scripts/docker-entrypoint.js` reads `nextauth_secret`, `encryption_key`, `db_password`, and `redis_url` and sets them as env vars.

- For Azure Key Vault integration: retrieve secrets during CI/CD and write them to temporary files before build, or inject them as BuildKit secrets via your runner's secret API. Example using `az keyvault secret download` in your pipeline to create local secret files used with `--secret src=`.

Security notes:
- Never bake secrets into image layers; always use `--mount=type=secret`/BuildKit or runtime mounts.
- Ensure CI logs do not print secret contents.
- Rotate secrets in Key Vault when compromised.
