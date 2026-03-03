CREATE TABLE `drive_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` int,
	`agent_id` int,
	`file_name` varchar(255) NOT NULL,
	`drive_file_id` varchar(128) NOT NULL,
	`drive_url` varchar(512) NOT NULL,
	`mime_type` varchar(128),
	`file_size` int,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drive_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` int NOT NULL,
	`agent_id` int,
	`agent_name` varchar(128),
	`level` enum('info','warning','error','success') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `agents` ADD `mcp_endpoint` varchar(512);--> statement-breakpoint
ALTER TABLE `agents` ADD `drive_folder_id` varchar(128);--> statement-breakpoint
ALTER TABLE `agents` ADD `drive_folder_url` varchar(512);--> statement-breakpoint
ALTER TABLE `agents` ADD `api_key` varchar(128);--> statement-breakpoint
ALTER TABLE `agents` ADD `agent_type` enum('manus','n8n','autogpt','crewai','custom') DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE `tasks` ADD `result_drive_url` varchar(512);--> statement-breakpoint
ALTER TABLE `tasks` ADD `result_drive_file_id` varchar(128);--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_date` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `tags` json;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by` int;