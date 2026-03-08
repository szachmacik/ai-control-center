-- Migration: 0007_webhooks_apikeys_knowledge
-- Adds: sandbox_webhooks, sentinel_api_keys, knowledge_files

CREATE TABLE IF NOT EXISTS `sandbox_webhooks` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `sandbox_id` int NOT NULL,
  `user_id` int NOT NULL,
  `url` varchar(512) NOT NULL,
  `secret` varchar(128),
  `events` json,
  `is_active` boolean NOT NULL DEFAULT true,
  `last_triggered_at` timestamp,
  `last_status_code` int,
  `failure_count` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `sentinel_api_keys` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `user_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `key_hash` varchar(64) NOT NULL UNIQUE,
  `key_prefix` varchar(12) NOT NULL,
  `scopes` json,
  `is_active` boolean NOT NULL DEFAULT true,
  `expires_at` timestamp,
  `last_used_at` timestamp,
  `usage_count` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `knowledge_files` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `user_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `category` varchar(64) NOT NULL DEFAULT 'general',
  `tags` json,
  `file_name` varchar(255) NOT NULL,
  `file_size` int,
  `mime_type` varchar(128),
  `storage_key` varchar(512) NOT NULL,
  `public_url` varchar(512),
  `is_starred` boolean NOT NULL DEFAULT false,
  `view_count` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
