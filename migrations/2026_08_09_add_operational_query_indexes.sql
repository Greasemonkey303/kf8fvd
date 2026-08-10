ALTER TABLE `login_attempts`
  ADD KEY `idx_login_attempts_created_at` (`created_at`),
  ADD KEY `idx_login_attempts_success_created_at` (`success`, `created_at`),
  ADD KEY `idx_login_attempts_reason_created_at` (`reason`, `created_at`),
  ADD KEY `idx_login_attempts_ip_created_at` (`ip`, `created_at`);

ALTER TABLE `rate_limiter_counts`
  ADD KEY `idx_rate_limiter_counts_expires_at` (`expires_at`);
