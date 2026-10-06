ALTER TABLE `meals` ADD `share_people` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `activity_level` text DEFAULT 'light' NOT NULL;