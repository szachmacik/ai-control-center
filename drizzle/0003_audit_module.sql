-- Audit Module Migration
-- Adds: audit_projects, audit_runs, audit_findings, uptime_checks

CREATE TABLE `audit_projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `type` enum('github_repo','url','supabase','npm_package') NOT NULL,
  `target` varchar(512) NOT NULL,
  `description` text,
  `enabled` boolean NOT NULL DEFAULT true,
  `config` json,
  `created_by` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `audit_projects_id` PRIMARY KEY(`id`)
);

CREATE TABLE `audit_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `audit_type` enum('uptime','security','functional','dependency','db_health') NOT NULL,
  `status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
  `severity` enum('none','low','medium','high','critical') NOT NULL DEFAULT 'none',
  `total_findings` int NOT NULL DEFAULT 0,
  `critical_count` int NOT NULL DEFAULT 0,
  `high_count` int NOT NULL DEFAULT 0,
  `medium_count` int NOT NULL DEFAULT 0,
  `low_count` int NOT NULL DEFAULT 0,
  `report_markdown` text,
  `drive_url` varchar(512),
  `triggered_by` varchar(64) NOT NULL DEFAULT 'schedule',
  `started_at` timestamp NOT NULL DEFAULT (now()),
  `completed_at` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `audit_runs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `audit_findings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `run_id` int NOT NULL,
  `audit_project_id` int,
  `severity` enum('critical','high','medium','low','info') NOT NULL,
  `category` varchar(64) NOT NULL,
  `code` varchar(32) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `location` varchar(512),
  `evidence` text,
  `auto_fixed` boolean NOT NULL DEFAULT false,
  `fix_description` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `audit_findings_id` PRIMARY KEY(`id`)
);

CREATE TABLE `uptime_checks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `audit_project_id` int NOT NULL,
  `url` varchar(512) NOT NULL,
  `status_code` int,
  `response_time_ms` int,
  `is_up` boolean NOT NULL DEFAULT true,
  `is_slow` boolean NOT NULL DEFAULT false,
  `error_message` varchar(512),
  `checked_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `uptime_checks_id` PRIMARY KEY(`id`)
);

-- Indexes for common queries
CREATE INDEX `idx_audit_runs_type` ON `audit_runs` (`audit_type`);
CREATE INDEX `idx_audit_runs_started` ON `audit_runs` (`started_at`);
CREATE INDEX `idx_audit_findings_run` ON `audit_findings` (`run_id`);
CREATE INDEX `idx_audit_findings_severity` ON `audit_findings` (`severity`);
CREATE INDEX `idx_uptime_checks_project` ON `uptime_checks` (`audit_project_id`);
CREATE INDEX `idx_uptime_checks_checked` ON `uptime_checks` (`checked_at`);
