CREATE TABLE "place_votes" (
	"place_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	CONSTRAINT "place_votes_place_id_participant_id_pk" PRIMARY KEY("place_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"location" text,
	"price" text,
	"note" text,
	"added_by_participant_id" uuid,
	"added_by_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_votes" ADD CONSTRAINT "place_votes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_votes" ADD CONSTRAINT "place_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_added_by_participant_id_participants_id_fk" FOREIGN KEY ("added_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_votes_participant_id_idx" ON "place_votes" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "places_trip_id_idx" ON "places" USING btree ("trip_id");