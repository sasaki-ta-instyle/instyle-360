CREATE TABLE "answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"rater_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"scale_value" integer,
	"text_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_set_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"body" text NOT NULL,
	"response_type" text DEFAULT 'scale' NOT NULL,
	"scale_min" integer DEFAULT 1 NOT NULL,
	"scale_max" integer DEFAULT 5 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raters" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"relation" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"token" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "raters_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"position_snapshot" text,
	"department_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "question_set_id" integer;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_rater_id_raters_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."raters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raters" ADD CONSTRAINT "raters_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raters" ADD CONSTRAINT "raters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_rater_question_unique" ON "answers" USING btree ("rater_id","question_id");--> statement-breakpoint
CREATE INDEX "categories_qset_order_idx" ON "categories" USING btree ("question_set_id","order_index");--> statement-breakpoint
CREATE INDEX "questions_cat_order_idx" ON "questions" USING btree ("category_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "raters_subject_user_unique" ON "raters" USING btree ("subject_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_project_user_unique" ON "subjects" USING btree ("project_id","user_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;