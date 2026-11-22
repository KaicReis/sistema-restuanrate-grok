ALTER TABLE "snapshots" ADD COLUMN "revision" integer;--> statement-breakpoint
CREATE INDEX "snapshots_revision_idx" ON "snapshots" USING btree ("revision");