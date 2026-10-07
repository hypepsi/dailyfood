CREATE TABLE `meal_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`position` integer NOT NULL,
	`image_path` text,
	`thumb_path` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_images_meal_idx` ON `meal_images` (`meal_id`,`position`);--> statement-breakpoint
-- 把原来每顿饭的那一张照片搬到新表里，再删掉旧列
INSERT INTO `meal_images` (`meal_id`, `position`, `image_path`, `thumb_path`, `created_at`)
SELECT `id`, 0, `image_path`, `thumb_path`, `created_at` FROM `meals` WHERE `thumb_path` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `meals` DROP COLUMN `image_path`;--> statement-breakpoint
ALTER TABLE `meals` DROP COLUMN `thumb_path`;