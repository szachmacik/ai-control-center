-- Migration: 0005_meta_ads_capi
-- Adds Meta Ads Conversions API (CAPI) tables

CREATE TABLE IF NOT EXISTS `meta_pixels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `pixel_id` varchar(64) NOT NULL,
  `access_token` text NOT NULL,
  `test_event_code` varchar(32),
  `domain` varchar(255),
  `is_active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_meta_pixels_user_id` (`user_id`)
);

CREATE TABLE IF NOT EXISTS `meta_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pixel_id` int NOT NULL,
  `user_id` int NOT NULL,
  `event_name` varchar(64) NOT NULL,
  `source_url` varchar(512),
  `success` boolean NOT NULL DEFAULT false,
  `error_message` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_meta_events_pixel_id` (`pixel_id`),
  KEY `idx_meta_events_user_id` (`user_id`),
  KEY `idx_meta_events_created` (`createdAt`)
);
