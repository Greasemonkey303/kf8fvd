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

Checklist verification steps:
- Run deploy in a staging environment and execute full E2E smoke tests.
- Validate that secrets are not present in logs or image metadata.
- Verify performance and scaling under load (example: k6 or Locust testing).
