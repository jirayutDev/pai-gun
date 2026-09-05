CREATE TABLE "availability" (
	"participant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"value" smallint NOT NULL,
	CONSTRAINT "availability_participant_id_day_pk" PRIMARY KEY("participant_id","day")
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"crew_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_key" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"is_key" boolean DEFAULT false NOT NULL,
	"rsvp" text,
	"plus_ones" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"admin_key" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"length_days" integer NOT NULL,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'polling' NOT NULL,
	"locked_start" date,
	"allow_self_join" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trips_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_participant_id_idx" ON "availability" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "crew_members_crew_id_idx" ON "crew_members" USING btree ("crew_id");--> statement-breakpoint
CREATE INDEX "participants_trip_id_idx" ON "participants" USING btree ("trip_id");