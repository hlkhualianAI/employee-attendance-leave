ALTER TABLE `employees` MODIFY COLUMN `workStartMin` int NOT NULL DEFAULT 510;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `workEndMin` int NOT NULL DEFAULT 1050;--> statement-breakpoint
ALTER TABLE `attendance` ADD `checkInMode` enum('office','offsite') DEFAULT 'office' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `attendance` ADD `longitude` double;