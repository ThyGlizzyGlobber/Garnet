ALTER TABLE `bill` ADD `alert_kind` text;--> statement-breakpoint
ALTER TABLE `bill` ADD `alert_at` text;--> statement-breakpoint
ALTER TABLE `bill` ADD `alert_document_id` text REFERENCES source_document(id) ON DELETE set null;