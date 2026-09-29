-- Projections are worked out on every read; the cache nobody read goes.
-- Bills are looked up by the file they came from (Inbox, document clean-ups).
DROP TABLE `projection`;--> statement-breakpoint
CREATE INDEX `bill_source_document_idx` ON `bill` (`source_document_id`);--> statement-breakpoint
CREATE INDEX `bill_alert_document_idx` ON `bill` (`alert_document_id`);