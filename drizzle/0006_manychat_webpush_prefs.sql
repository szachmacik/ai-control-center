-- Migration: 0006_manychat_webpush_prefs
-- Adds: manychat_events, web_push_subscriptions, sandbox_user_prefs
-- Also adds manychat_forward_enabled column to meta_pixels

-- ManyChat Events
CREATE TABLE IF NOT EXISTS `manychat_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `pixel_id` int,
  `event_type` varchar(64) NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'other',
  `is_lead` int NOT NULL DEFAULT 0,
  `is_conversion` int NOT NULL DEFAULT 0,
  `subscriber_id` varchar(128),
  `subscriber_email` varchar(255),
  `subscriber_phone` varchar(32),
  `subscriber_name` varchar(128),
  `channel` varchar(32),
  `flow_id` varchar(128),
  `flow_name` varchar(255),
  `tag` varchar(128),
  `raw_payload` text,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Web Push Subscriptions
CREATE TABLE IF NOT EXISTS `web_push_subscriptions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `user_id` int NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `user_agent` varchar(512),
  `is_active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp
);

-- Sandbox User Preferences
CREATE TABLE IF NOT EXISTS `sandbox_user_prefs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `user_id` int NOT NULL UNIQUE,
  `default_scan_type` enum('passive','active','headers','ssl','full') NOT NULL DEFAULT 'passive',
  `default_ttl_minutes` int NOT NULL DEFAULT 60,
  `default_mode` enum('cloud','download') NOT NULL DEFAULT 'download',
  `max_sandboxes` int NOT NULL DEFAULT 5,
  `notify_on_scan_complete` boolean NOT NULL DEFAULT true,
  `notify_on_critical` boolean NOT NULL DEFAULT true,
  `notify_on_expiry` boolean NOT NULL DEFAULT true,
  `auto_delete_after_scan` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add manychat_forward_enabled to meta_pixels (if not exists)
ALTER TABLE `meta_pixels`
  ADD COLUMN IF NOT EXISTS `manychat_forward_enabled` boolean NOT NULL DEFAULT false;
