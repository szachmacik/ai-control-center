CREATE TABLE `agent_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agent_id` int,
	`agent_name` varchar(128),
	`task_id` int,
	`event_type` enum('info','warning','error','success') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`role` varchar(128),
	`description` text,
	`model` varchar(64),
	`status` enum('active','idle','offline','error') NOT NULL DEFAULT 'idle',
	`tasks_completed` int NOT NULL DEFAULT 0,
	`last_active` timestamp,
	`config` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infrastructure` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('server','database','api','service','storage','other') NOT NULL DEFAULT 'server',
	`url` varchar(512),
	`status` enum('healthy','degraded','offline','unknown') NOT NULL DEFAULT 'unknown',
	`metadata` json,
	`last_checked` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `infrastructure_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`template` varchar(64) NOT NULL DEFAULT 'web-app',
	`subdomain` varchar(128),
	`repo` varchar(256),
	`status` enum('pending','building','deployed','failed') NOT NULL DEFAULT 'pending',
	`deploy_url` varchar(512),
	`created_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`created_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `secrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `secrets_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 5,
	`assigned_to` varchar(128),
	`agent_id` int,
	`result` text,
	`error` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
