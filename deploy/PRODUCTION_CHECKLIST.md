Production Deployment Checklist
=============================

Minimal steps to deploy to production:

- Infrastructure as Code (IaC): maintain Bicep/Terraform that provisions app service/container registry, managed DB, Redis, storage, Key Vault, and monitoring resources.
- Secrets: store all runtime secrets in Azure Key Vault or GitHub Secrets. Do NOT bake secrets into images.
- CI/CD: configure the pipeline to build images with BuildKit secrets or to inject runtime secrets from Key Vault at deployment time.
- Health & readiness: implement HTTP health checks and readiness probes; CI pipeline should run smoke tests after deployment.
- Monitoring & alerts: configure Application Insights / Prometheus + Grafana and alerting for 5xx rate, high latency, CPU, memory.
- Backups: enable automated backups for DB and object storage; verify restore procedure.
- Rollout strategy: use staged rollouts (blue-green or canary) and feature flags for risky changes.
- Security: enable HTTPS, enforce CSP with nonces, use managed identity for resource access, enable RBAC, and scan images with Trivy before deploy.
- Observability: ensure logs, traces, and metrics are collected centrally and retention policies are defined.

Current repo rollout reminder:

- Review `deploy/DEPLOY_UPDATE_2026-03-29_UMAMI_MONITORING.md` before deploying the current analytics and monitoring changes.
- Apply the main site MySQL migration `migrations/2026_03_29_maintenance_runs.sql` when deploying the updated admin monitoring page.
- Deploy and verify the added self-hosted analytics services:
	- `umami`
	- `umami-db`
- Replace all dev-only Umami and PostgreSQL secrets before production rollout.

Checklist verification steps:
- Run deploy in a staging environment and execute full E2E smoke tests.
- Validate that secrets are not present in logs or image metadata.
- Verify performance and scaling under load (example: k6 or Locust testing).
