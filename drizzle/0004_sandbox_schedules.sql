-- Migration: 0004_sandbox_schedules
-- Adds recurring scan schedules for Security Sandbox

CREATE TABLE IF NOT EXISTS `sandbox_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sandbox_id` int NOT NULL,
  `user_id` int,
  `schedule` enum('daily','weekly','monthly') NOT NULL,
  `scan_type` enum('passive','active','xss','sqli','headers','ssl','csrf','open_redirect','full') NOT NULL DEFAULT 'passive',
  `is_active` boolean NOT NULL DEFAULT true,
  `next_run_at` timestamp NOT NULL,
  `last_run_at` timestamp,
  `run_count` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedules_sandbox_id` (`sandbox_id`),
  KEY `idx_schedules_next_run` (`next_run_at`),
  KEY `idx_schedules_active` (`is_active`)
);

-- Add progress and triggeredBy fields to sandbox_scans if not already present
ALTER TABLE `sandbox_scans`
  ADD COLUMN IF NOT EXISTS `progress` int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `triggered_by` varchar(32) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS `error_message` text;
