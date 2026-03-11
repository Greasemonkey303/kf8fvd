This folder contains admin utilities pages: Locks and Login Attempts.

APIs added:
- POST /api/admin/utilities/unlock - unlock a key_name
- GET /api/admin/utilities/locks - list locks
- GET /api/admin/utilities/login-attempts - list attempts

Run the migration file at migrations/2026_03_10_add_auth_tables.sql in MySQL Workbench.
