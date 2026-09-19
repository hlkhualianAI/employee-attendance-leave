ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','hr','employee') NOT NULL DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE `employees` ADD `userId` int;--> statement-breakpoint
CREATE INDEX `employees_user_idx` ON `employees` (`userId`);