ALTER TABLE `service` ADD `trusted_senders` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_document` ADD `sender_domain` text;--> statement-breakpoint
ALTER TABLE `source_document` ADD `sender_verified` integer;