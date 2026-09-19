CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`workDate` varchar(10) NOT NULL,
	`checkInAt` bigint,
	`checkOutAt` bigint,
	`lateMinutes` int NOT NULL DEFAULT 0,
	`note` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeCode` varchar(32) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`department` varchar(120) NOT NULL,
	`position` varchar(120) NOT NULL,
	`workStartMin` int NOT NULL DEFAULT 540,
	`workEndMin` int NOT NULL DEFAULT 1080,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_employeeCode_unique` UNIQUE(`employeeCode`)
);
--> statement-breakpoint
CREATE TABLE `leaveRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`leaveType` enum('annual','sick','personal','other') NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`totalDays` int NOT NULL,
	`reason` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `leaveRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `attendance_employee_date_idx` ON `attendance` (`employeeId`,`workDate`);--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendance` (`workDate`);--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department`);--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `leave_employee_idx` ON `leaveRequests` (`employeeId`);--> statement-breakpoint
CREATE INDEX `leave_status_idx` ON `leaveRequests` (`status`);--> statement-breakpoint
CREATE INDEX `leave_date_idx` ON `leaveRequests` (`startDate`,`endDate`);