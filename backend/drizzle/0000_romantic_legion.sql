DO $$ BEGIN
 CREATE TYPE "public"."competition_status" AS ENUM('draft', 'active', 'ended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_status" AS ENUM('pending', 'filled', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop_loss');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('user', 'educator', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competition_holdings" (
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"avg_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_holdings_competition_id_user_id_ticker_pk" PRIMARY KEY("competition_id","user_id","ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competition_participants" (
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"virtual_balance" numeric(15, 2) NOT NULL,
	"rank" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_participants_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"start_balance" numeric(15, 2) DEFAULT '10000.00' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "competition_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holdings" (
	"user_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"avg_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_user_id_ticker_pk" PRIMARY KEY("user_id","ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"type" "order_type" NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"limit_price" numeric(12, 4),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"filled_price" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_ticks" (
	"time" timestamp with time zone NOT NULL,
	"ticker" text NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"volume" integer NOT NULL,
	CONSTRAINT "price_ticks_time_ticker_pk" PRIMARY KEY("time","ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"virtual_balance" numeric(15, 2) DEFAULT '1000000.00' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competition_holdings" ADD CONSTRAINT "competition_holdings_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competition_holdings" ADD CONSTRAINT "competition_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competition_participants" ADD CONSTRAINT "competition_participants_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competition_participants" ADD CONSTRAINT "competition_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competitions" ADD CONSTRAINT "competitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
