


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_settle"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM "public"."profiles" p
        WHERE p."id" = auth.uid()
          AND p."role" IN ('admin','cs')   -- ← 여기만 바꾸면 된다
    );
$$;


ALTER FUNCTION "public"."can_settle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_outsourcing_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_status   text;
  v_old_designer uuid;
  v_old_price    integer;
BEGIN
  -- 알림 실패가 원래 작업(승인 · 수정요청 · 배정)을 되돌리면 안 된다 (15절 ㊽)
  BEGIN
    -- 삭제된 작업은 알리지 않는다
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
 
    IF TG_OP = 'UPDATE' THEN
      v_old_status   := OLD.outsourcing_status;
      v_old_designer := OLD.assigned_designer_id;
      v_old_price    := OLD.outsourcing_price;
    END IF;
 
    -- ── T6 released : 이전 담당이 빠졌다 (먼저 — 교체면 T6 → T1 순서로 쌓인다)
    IF TG_OP = 'UPDATE'
       AND v_old_designer IS NOT NULL
       AND NEW.assigned_designer_id IS DISTINCT FROM v_old_designer
       AND v_old_status IN ('claimed', 'review', 'customer_review', 'rework', 'done') THEN   -- ★
      INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
      VALUES ('released', NEW.id, 'outsourcing', v_old_designer,
              jsonb_build_object('prev_status', v_old_status));
    END IF;
 
    -- ── T1 assign : 담당이 새로 생겼다
    --    INSERT 는 사내 지명 플래그가 있어야 한다 (BoardWriteModal)
    --    UPDATE 는 사내 지명 플래그가 있거나, 기존 담당을 다른 사람으로 바꾼 경우(= 사내 교체)
    --    외주 셀프 가져가기는 OLD 담당 NULL + 플래그 false 라 걸리지 않는다
    IF NEW.assigned_designer_id IS NOT NULL
       AND NEW.outsourcing_status IN ('claimed', 'review', 'customer_review', 'rework')        -- ★
       AND (
         (TG_OP = 'INSERT' AND NEW.outsourcing_assigned_by_staff IS TRUE)
         OR
         (TG_OP = 'UPDATE'
          AND NEW.assigned_designer_id IS DISTINCT FROM v_old_designer
          AND (NEW.outsourcing_assigned_by_staff IS TRUE OR v_old_designer IS NOT NULL))
       ) THEN
      INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
      VALUES ('assign', NEW.id, 'outsourcing', NEW.assigned_designer_id, '{}'::jsonb);
    END IF;
 
    -- ── T2 · T3 · T4 : 상태 전환 (담당은 그대로인 경우)
    IF TG_OP = 'UPDATE'
       AND NEW.outsourcing_status IS DISTINCT FROM v_old_status
       AND NEW.assigned_designer_id IS NOT NULL
       AND NEW.assigned_designer_id IS NOT DISTINCT FROM v_old_designer THEN
 
      -- ★ customer_review → review 는 사내의 되돌리기다. 외주가 새로 요청한 게 아니므로 T2 를 쌓지 않는다
      IF NEW.outsourcing_status = 'review'
         AND v_old_status IS DISTINCT FROM 'customer_review' THEN
        INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
        VALUES ('review_request', NEW.id, 'staff', NULL,
                jsonb_build_object('round', NEW.outsourcing_round));
 
      ELSIF NEW.outsourcing_status = 'rework' THEN
        -- review · customer_review 어느 쪽에서 와도 T3
        INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
        VALUES ('rework', NEW.id, 'outsourcing', NEW.assigned_designer_id,
                jsonb_build_object('round', NEW.outsourcing_round));
 
      ELSIF NEW.outsourcing_status = 'done' THEN
        INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
        VALUES ('approved', NEW.id, 'outsourcing', NEW.assigned_designer_id, '{}'::jsonb);
      END IF;
      -- customer_review 로 들어갈 때는 아무것도 쌓지 않는다 (알림 없음)
    END IF;
 
    -- ── T7 price_changed : 진행 중 · 담당 그대로 · 전후 모두 값 있음
    IF TG_OP = 'UPDATE'
       AND NEW.outsourcing_price IS DISTINCT FROM v_old_price
       AND v_old_price IS NOT NULL
       AND NEW.outsourcing_price IS NOT NULL
       AND NEW.assigned_designer_id IS NOT NULL
       AND NEW.assigned_designer_id IS NOT DISTINCT FROM v_old_designer
       AND NEW.outsourcing_status IN ('claimed', 'review', 'customer_review', 'rework') THEN   -- ★
      INSERT INTO notification_outbox (event, task_id, recipient_side, recipient_designer_id, payload)
      VALUES ('price_changed', NEW.id, 'outsourcing', NEW.assigned_designer_id,
              jsonb_build_object('before', v_old_price, 'after', NEW.outsourcing_price));
    END IF;
 
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_outsourcing_notification(%): %', NEW.id, SQLERRM;
  END;
 
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."enqueue_outsourcing_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_my_outsourcing_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM "public"."tasks" t
        JOIN "public"."designers" d ON d."id" = t."assigned_designer_id"
        WHERE t."id" = p_task_id
          AND d."user_id" = auth.uid()
    );
$$;


ALTER FUNCTION "public"."is_my_outsourcing_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_member"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM "public"."chat_room_members" m
        WHERE m."room_id" = p_room_id
          AND m."user_id" = auth.uid()
    );
$$;


ALTER FUNCTION "public"."is_room_member"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM "public"."profiles" p
        WHERE p."id" = auth.uid()
          AND p."role" IN ('admin', 'designer', 'cs')
    );
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "attachments" "jsonb",
    CONSTRAINT "chat_messages_body_or_attachments" CHECK (((("body" IS NOT NULL) AND ("btrim"("body") <> ''::"text")) OR (("attachments" IS NOT NULL) AND ("jsonb_typeof"("attachments") = 'array'::"text") AND ("jsonb_array_length"("attachments") > 0))))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_room_members" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "name" "text",
    "dm_key" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "chat_rooms_kind_check" CHECK (("kind" = ANY (ARRAY['channel'::"text", 'dm'::"text"]))),
    CONSTRAINT "chat_rooms_shape_check" CHECK (((("kind" = 'channel'::"text") AND ("name" IS NOT NULL) AND ("dm_key" IS NULL)) OR (("kind" = 'dm'::"text") AND ("dm_key" IS NOT NULL))))
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."designer_contacts" (
    "designer_id" "uuid" NOT NULL,
    "phone" "text",
    "notify_consent_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "designer_contacts_phone_check" CHECK ((("phone" IS NULL) OR ("phone" ~ '^0[0-9]{8,10}$'::"text")))
);


ALTER TABLE "public"."designer_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."designers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT '여유'::"text",
    "avatar_url" "text",
    "user_id" "uuid",
    "music_title" "text",
    "music_link" "text",
    "banner_color" "text",
    "email" "text",
    "member_type" "text" DEFAULT 'designer'::"text" NOT NULL,
    CONSTRAINT "designers_member_type_check" CHECK (("member_type" = ANY (ARRAY['designer'::"text", 'cs'::"text", 'outsourcing'::"text"]))),
    CONSTRAINT "designers_status_check" CHECK (("status" = ANY (ARRAY['연차'::"text", '반차'::"text", '외출'::"text", '작업중'::"text", '바쁨'::"text"])))
);


ALTER TABLE "public"."designers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_outbox" (
    "id" bigint NOT NULL,
    "event" "text" NOT NULL,
    "task_id" "uuid",
    "recipient_side" "text" NOT NULL,
    "recipient_designer_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "provider_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "notification_outbox_event_check" CHECK (("event" = ANY (ARRAY['assign'::"text", 'review_request'::"text", 'rework'::"text", 'approved'::"text", 'settled'::"text", 'released'::"text", 'price_changed'::"text"]))),
    CONSTRAINT "notification_outbox_recipient_side_check" CHECK (("recipient_side" = ANY (ARRAY['staff'::"text", 'outsourcing'::"text"]))),
    CONSTRAINT "notification_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."notification_outbox" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."notification_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."notification_outbox_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."notification_outbox_id_seq" OWNED BY "public"."notification_outbox"."id";



CREATE TABLE IF NOT EXISTS "public"."outsourcing_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "round" integer DEFAULT 1 NOT NULL,
    "side" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text" NOT NULL,
    "author_id" "uuid",
    "author_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outsourcing_messages_kind_check" CHECK (("kind" = ANY (ARRAY['review_request'::"text", 'rework'::"text", 'note'::"text", 'approve'::"text", 'price_changed'::"text"]))),
    CONSTRAINT "outsourcing_messages_side_check" CHECK (("side" = ANY (ARRAY['staff'::"text", 'outsourcing'::"text"])))
);


ALTER TABLE "public"."outsourcing_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'designer'::"text", 'cs'::"text", 'outsourcing'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_contacts" (
    "user_id" "uuid" NOT NULL,
    "phone" "text" NOT NULL,
    "notify_consent_at" timestamp with time zone NOT NULL,
    "review_request_on" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_contacts_phone_check" CHECK (("phone" ~ '^01[016789][0-9]{7,8}$'::"text"))
);


ALTER TABLE "public"."staff_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_contacts" IS '사내 직원 알림톡 수신 (T2 검수요청). 서버(service role) 전용 — 브라우저 권한 없음. 문서 13-7-10';



CREATE TABLE IF NOT EXISTS "public"."task_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid",
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer,
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uploaded_by_outsourcing" boolean DEFAULT false NOT NULL,
    "file_role" "text" DEFAULT 'source'::"text" NOT NULL,
    "outsourcing_round" integer,
    "uploaded_by_name" "text",
    CONSTRAINT "task_files_file_role_check" CHECK (("file_role" = ANY (ARRAY['source'::"text", 'deliverable'::"text", 'feedback'::"text", 'internal'::"text"]))),
    CONSTRAINT "task_files_role_flag_sync" CHECK (("uploaded_by_outsourcing" = ("file_role" = 'deliverable'::"text")))
);


ALTER TABLE "public"."task_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "changed_field" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "reason" "text",
    "user_id" "uuid",
    "changed_by_name" "text"
);


ALTER TABLE "public"."task_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_source" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "order_method" "text" NOT NULL,
    "print_items" "text" NOT NULL,
    "post_processing" "text" DEFAULT '후가공없음'::"text",
    "file_paths" "text"[],
    "consult_path" "text",
    "special_details" "text",
    "assigned_designer_id" "uuid",
    "status" "text" DEFAULT '대기중'::"text",
    "is_priority" boolean DEFAULT false,
    "is_quick" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "order_method_note" "text",
    "consult_link" "text",
    "task_number" bigint NOT NULL,
    "registered_by" "text",
    "group_id" "uuid",
    "outsourcing_open" boolean DEFAULT false NOT NULL,
    "outsourcing_price" integer,
    "outsourcing_status" "text",
    "outsourcing_round" integer DEFAULT 1 NOT NULL,
    "outsourcing_unread_staff" boolean DEFAULT false NOT NULL,
    "outsourcing_unread_worker" boolean DEFAULT false NOT NULL,
    "outsourcing_assigned_by_staff" boolean DEFAULT false NOT NULL,
    "outsourcing_settled_at" timestamp with time zone,
    "outsourcing_visible_from_round" integer DEFAULT 1 NOT NULL,
    "outsourcing_settled_by" "uuid",
    "due_at" timestamp with time zone,
    "outsourcing_done_at" timestamp with time zone,
    "print_accepted_at" timestamp with time zone,
    "print_accepted_by" "uuid",
    "print_received_at" timestamp with time zone,
    "print_received_by" "uuid",
    CONSTRAINT "tasks_outsourcing_status_check" CHECK ((("outsourcing_status" IS NULL) OR ("outsourcing_status" = ANY (ARRAY['open'::"text", 'claimed'::"text", 'review'::"text", 'customer_review'::"text", 'rework'::"text", 'done'::"text"]))))
);

ALTER TABLE ONLY "public"."tasks" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tasks_task_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tasks_task_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tasks_task_number_seq" OWNED BY "public"."tasks"."task_number";



ALTER TABLE ONLY "public"."notification_outbox" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_outbox_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tasks" ALTER COLUMN "task_number" SET DEFAULT "nextval"('"public"."tasks_task_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("room_id", "user_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."designer_contacts"
    ADD CONSTRAINT "designer_contacts_pkey" PRIMARY KEY ("designer_id");



ALTER TABLE ONLY "public"."designers"
    ADD CONSTRAINT "designers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outsourcing_messages"
    ADD CONSTRAINT "outsourcing_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_contacts"
    ADD CONSTRAINT "staff_contacts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."task_files"
    ADD CONSTRAINT "task_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_logs"
    ADD CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_chat_messages_room" ON "public"."chat_messages" USING "btree" ("room_id", "created_at" DESC);



CREATE INDEX "idx_chat_room_members_user" ON "public"."chat_room_members" USING "btree" ("user_id");



CREATE INDEX "idx_outsourcing_messages_task" ON "public"."outsourcing_messages" USING "btree" ("task_id", "round", "created_at");



CREATE INDEX "idx_task_files_round" ON "public"."task_files" USING "btree" ("task_id", "outsourcing_round");



CREATE INDEX "idx_task_files_task_role" ON "public"."task_files" USING "btree" ("task_id", "file_role");



CREATE INDEX "idx_tasks_designer_status" ON "public"."tasks" USING "btree" ("assigned_designer_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tasks_group_id" ON "public"."tasks" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE INDEX "idx_tasks_outsourcing_status" ON "public"."tasks" USING "btree" ("outsourcing_status") WHERE ("outsourcing_status" IS NOT NULL);



CREATE INDEX "idx_tasks_priority_unassigned" ON "public"."tasks" USING "btree" ("is_priority", "status", "assigned_designer_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tasks_unread_staff" ON "public"."tasks" USING "btree" ("outsourcing_unread_staff") WHERE ("outsourcing_unread_staff" = true);



CREATE INDEX "idx_tasks_unsettled" ON "public"."tasks" USING "btree" ("assigned_designer_id") WHERE (("outsourcing_status" = 'done'::"text") AND ("outsourcing_settled_at" IS NULL));



CREATE INDEX "notification_outbox_dedupe_idx" ON "public"."notification_outbox" USING "btree" ("task_id", "event", "recipient_designer_id", "created_at" DESC);



CREATE INDEX "notification_outbox_status_idx" ON "public"."notification_outbox" USING "btree" ("status", "created_at");



CREATE INDEX "task_logs_created_at_idx" ON "public"."task_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "task_logs_task_id_idx" ON "public"."task_logs" USING "btree" ("task_id");



CREATE UNIQUE INDEX "tasks_task_number_idx" ON "public"."tasks" USING "btree" ("task_number");



CREATE UNIQUE INDEX "uq_chat_rooms_dm_key" ON "public"."chat_rooms" USING "btree" ("dm_key") WHERE ("dm_key" IS NOT NULL);



CREATE OR REPLACE TRIGGER "notify_dispatch" AFTER INSERT ON "public"."notification_outbox" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://paper-o2.vercel.app/api/notify/dispatch', 'POST', '{"Content-type":"application/json","Authorization":"Bearer 93227058deb314ff55c8c8ed08878318415516d38cd97f9a4c0fc4304f3f8041"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "tasks_enqueue_notification" AFTER INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_outsourcing_notification"();



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."designer_contacts"
    ADD CONSTRAINT "designer_contacts_designer_id_fkey" FOREIGN KEY ("designer_id") REFERENCES "public"."designers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."designers"
    ADD CONSTRAINT "designers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_recipient_designer_id_fkey" FOREIGN KEY ("recipient_designer_id") REFERENCES "public"."designers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_outbox"
    ADD CONSTRAINT "notification_outbox_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."outsourcing_messages"
    ADD CONSTRAINT "outsourcing_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_contacts"
    ADD CONSTRAINT "staff_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_files"
    ADD CONSTRAINT "task_files_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_logs"
    ADD CONSTRAINT "task_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_logs"
    ADD CONSTRAINT "task_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_designer_id_fkey" FOREIGN KEY ("assigned_designer_id") REFERENCES "public"."designers"("id") ON DELETE SET NULL;



CREATE POLICY "Enable insert for authenticated users only" ON "public"."task_files" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "admin can write" ON "public"."app_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated can read" ON "public"."app_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated insert task_logs" ON "public"."task_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated select task_logs" ON "public"."task_logs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_insert" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_room_member"("room_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "chat_messages_select" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."is_room_member"("room_id"));



CREATE POLICY "chat_messages_update_own" ON "public"."chat_messages" FOR UPDATE TO "authenticated" USING ((("author_id" = "auth"."uid"()) AND "public"."is_room_member"("room_id"))) WITH CHECK (("author_id" = "auth"."uid"()));



ALTER TABLE "public"."chat_room_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_room_members_select" ON "public"."chat_room_members" FOR SELECT TO "authenticated" USING ("public"."is_room_member"("room_id"));



CREATE POLICY "chat_room_members_update_self" ON "public"."chat_room_members" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_rooms_select" ON "public"."chat_rooms" FOR SELECT TO "authenticated" USING ("public"."is_room_member"("id"));



CREATE POLICY "chat_rooms_update" ON "public"."chat_rooms" FOR UPDATE TO "authenticated" USING (("public"."is_staff"() AND "public"."is_room_member"("id"))) WITH CHECK (("public"."is_staff"() AND "public"."is_room_member"("id")));



ALTER TABLE "public"."designer_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."designers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "designers_select" ON "public"."designers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "designers_write_staff" ON "public"."designers" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."notification_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outsourcing_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outsourcing_messages_staff_insert" ON "public"."outsourcing_messages" FOR INSERT TO "authenticated" WITH CHECK ((("side" = 'staff'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'designer'::"text", 'cs'::"text"])))))));



CREATE POLICY "outsourcing_messages_staff_select" ON "public"."outsourcing_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'designer'::"text", 'cs'::"text"]))))));



CREATE POLICY "outsourcing_messages_worker_select" ON "public"."outsourcing_messages" FOR SELECT TO "authenticated" USING ("public"."is_my_outsourcing_task"("task_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."staff_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_files_select" ON "public"."task_files" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."task_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete" ON "public"."tasks" FOR DELETE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'outsourcing'::"text"))))));



CREATE POLICY "tasks_insert" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'outsourcing'::"text"))))));



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'outsourcing'::"text"))))) OR (EXISTS ( SELECT 1
   FROM "public"."designers"
  WHERE (("designers"."user_id" = "auth"."uid"()) AND ("designers"."id" = "tasks"."assigned_designer_id")))) OR (("outsourcing_open" = true) AND ("assigned_designer_id" IS NULL))));



CREATE POLICY "tasks_update" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'outsourcing'::"text")))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'outsourcing'::"text"))))) OR (EXISTS ( SELECT 1
   FROM "public"."designers"
  WHERE (("designers"."user_id" = "auth"."uid"()) AND ("designers"."id" = "tasks"."assigned_designer_id"))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."outsourcing_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."can_settle"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_settle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_settle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_outsourcing_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_outsourcing_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_my_outsourcing_task"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_my_outsourcing_task"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_my_outsourcing_task"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_room_member"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_members" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_members" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."designer_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."designers" TO "anon";
GRANT ALL ON TABLE "public"."designers" TO "authenticated";
GRANT ALL ON TABLE "public"."designers" TO "service_role";



GRANT ALL ON TABLE "public"."notification_outbox" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notification_outbox_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."outsourcing_messages" TO "anon";
GRANT ALL ON TABLE "public"."outsourcing_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."outsourcing_messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."staff_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."task_files" TO "anon";
GRANT ALL ON TABLE "public"."task_files" TO "authenticated";
GRANT ALL ON TABLE "public"."task_files" TO "service_role";



GRANT ALL ON TABLE "public"."task_logs" TO "anon";
GRANT ALL ON TABLE "public"."task_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."task_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































