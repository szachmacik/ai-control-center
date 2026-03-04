-- Security Sandbox: sandbox_environments
CREATE TABLE `sandbox_environments` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `user_id` int,
  `name` varchar(128) NOT NULL,
  `target_url` varchar(512) NOT NULL,
  `status` enum('cloning','ready','scanning','completed','error') NOT NULL DEFAULT 'cloning',
  `sandbox_url` varchar(512),
  `sandbox_port` int,
  `deploy_type` enum('manus_spaces','local_download') NOT NULL DEFAULT 'manus_spaces',
  `anonymized` boolean NOT NULL DEFAULT true,
  `clone_progress` int NOT NULL DEFAULT 0,
  `file_count` int NOT NULL DEFAULT 0,
  `notes` text,
  `created_by` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

-- Security Sandbox: sandbox_scans
CREATE TABLE `sandbox_scans` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `sandbox_id` int NOT NULL,
  `scan_type` enum('passive','active','xss','sqli','headers','ssl','csrf','open_redirect','full') NOT NULL DEFAULT 'passive',
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `started_at` timestamp,
  `completed_at` timestamp,
  `summary` json,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Security Sandbox: sandbox_findings
CREATE TABLE `sandbox_findings` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `scan_id` int NOT NULL,
  `sandbox_id` int NOT NULL,
  `severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'info',
  `category` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `evidence` text,
  `affected_url` varchar(512),
  `remediation` text,
  `cvss_score` varchar(8),
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
