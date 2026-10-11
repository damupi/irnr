CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer,
	`rental_period_id` integer,
	`filing_id` integer,
	`filename` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rental_period_id`) REFERENCES `rental_periods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`filing_id`) REFERENCES `filings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attachments_one_owner" CHECK(("attachments"."transaction_id" IS NOT NULL) + ("attachments"."rental_period_id" IS NOT NULL) + ("attachments"."filing_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE INDEX `attachments_transaction` ON `attachments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cat1` text NOT NULL,
	`cat2` text NOT NULL,
	`treatment` text NOT NULL,
	`box` integer,
	`prorate` integer DEFAULT false NOT NULL,
	`help` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_cat1_cat2` ON `categories` (`cat1`,`cat2`);--> statement-breakpoint
CREATE TABLE `filings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`income_type` text NOT NULL,
	`filed_at` text NOT NULL,
	`receipt_number` text,
	`gross_cents` integer DEFAULT 0 NOT NULL,
	`expenses_cents` integer DEFAULT 0 NOT NULL,
	`base_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`address` text,
	`cadastral_ref` text,
	`acquisition_date` text NOT NULL,
	`ownership_pct` real DEFAULT 100 NOT NULL,
	`residence_country` text DEFAULT 'DE' NOT NULL,
	`tax_rate_pct` real DEFAULT 19 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `property_year_params` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer NOT NULL,
	`year` integer NOT NULL,
	`cadastral_land_cents` integer NOT NULL,
	`cadastral_building_cents` integer NOT NULL,
	`imputation_rate_pct` real DEFAULT 2 NOT NULL,
	`initial_carryforward_cents` integer DEFAULT 0 NOT NULL,
	`deadline_override_from` text,
	`deadline_override_to` text,
	`days_imputed_override` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_year_unique` ON `property_year_params` (`property_id`,`year`);--> statement-breakpoint
CREATE TABLE `rental_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer NOT NULL,
	`tenant` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`monthly_rent_cents` integer NOT NULL,
	`agency` text,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payee` text,
	`concept` text NOT NULL,
	`category_id` integer,
	`has_invoice` integer DEFAULT false NOT NULL,
	`frequency` text DEFAULT 'unica' NOT NULL,
	`allocation_pct` real DEFAULT 100 NOT NULL,
	`tax_year_override` integer,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount_positive" CHECK("transactions"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_external_key` ON `transactions` (`external_key`);