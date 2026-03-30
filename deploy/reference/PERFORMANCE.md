Performance & Scaling Notes
==========================

Quick guidance to validate performance before production:

- Baseline metrics: capture current response latency percentiles (p50/p95/p99), request rate, error rate, CPU and memory usage.
- Load testing: use k6 or Locust to simulate realistic traffic patterns. Start with a small baseline then ramp to target concurrency.
- Caching: enable CDN for static assets, use HTTP caching headers, and consider server-side caching (Redis) for expensive queries.
- Database: add read-replicas if read-heavy, ensure proper indexes, and avoid N+1 queries.
- Connection pooling: ensure DB pools are sized for expected concurrency and app instances.
- Auto-scaling: configure horizontal autoscaling on container instances with CPU/memory and custom metrics (e.g., request latency).
- Observability: capture traces to identify slow paths; profile CPU hot spots if needed.
- Optimize images/resources: compress images, serve WebP/AVIF where possible, and use responsive images.
