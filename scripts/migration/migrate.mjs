#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// migrate.mjs — papero2page(구) Supabase → paperO2(신) Supabase 데이터 병합
//
// 사용법 (scripts/migration 폴더에서):
//   node migrate.mjs inspect   두 DB 스키마·행 수 비교 (읽기 전용)
//   node migrate.mjs plan      실제로 무엇이 들어갈지 미리보기 (읽기 전용)
//   node migrate.mjs apply --yes   신 DB에 적재 (단일 트랜잭션, 실패 시 전부 롤백)
//   node migrate.mjs verify    적재 후 행 수 / 고아 참조 검증 (읽기 전용)
//
// 중복 방지 규칙
//   auth.users      : id 동일 → 건너뜀 / 이메일 동일(다른 id) → 신 계정으로 병합 / 그 외 → 복사(비밀번호 해시 포함)
//   profiles        : 병합된 계정은 신 프로필 유지, 새로 복사된 계정만 구 프로필 적용
//   designers       : id → email → (이름+member_type) 순으로 같은 사람 탐지, 있으면 병합
//   app_settings    : key 충돌 시 신 DB 값 유지 (SETTINGS_PREFER=old 로 뒤집기 가능)
//   tasks           : id 동일 → 건너뜀 / task_number 충돌 → 새 번호 재발급 (목록 출력)
//   task_files/logs : id 동일 → 건너뜀, 참조하는 task 가 신 DB에 없으면 제외
// 구 DB 는 절대 쓰지 않는다 (SELECT 만).
// ─────────────────────────────────────────────────────────────
import pg from "pg";
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env.migration") });

const { Client } = pg;
const cmd = process.argv[2];
const YES = process.argv.includes("--yes");
const SETTINGS_PREFER = (process.env.SETTINGS_PREFER ?? "new").toLowerCase(); // new | old
const BATCH = 300;

if (!["inspect", "plan", "apply", "verify"].includes(cmd ?? "")) {
    console.error("사용법: node migrate.mjs <inspect|plan|apply|verify> [--yes]");
    process.exit(1);
}
for (const k of ["OLD_DB_URL", "NEW_DB_URL"]) {
    if (!process.env[k]) {
        console.error(`${k} 가 없습니다. .env.migration 을 확인하세요 (.env.migration.example 참고).`);
        process.exit(1);
    }
}

// 복사 대상 (순서 = FK 의존 순서)
const PUBLIC_TABLES = ["profiles", "designers", "app_settings", "tasks", "task_files", "task_logs"];
const PK = {
    "auth.users": ["id"],
    "auth.identities": ["provider_id", "provider"],
    "public.profiles": ["id"],
    "public.designers": ["id"],
    "public.app_settings": ["key"],
    "public.tasks": ["id"],
    "public.task_files": ["id"],
    "public.task_logs": ["id"],
};

// ── 연결 ─────────────────────────────────────────────────────
async function connect(url, label) {
    const isLocal = /@(127.0.0.1|localhost)[:/]/.test(url);
    const c = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, statement_timeout: 0 });
    try {
        await c.connect();
    } catch (e) {
        console.error(`[${label}] 접속 실패: ${e.message}`);
        console.error("  → Dashboard > Connect > Session pooler URI (포트 5432) 를 쓰고 비밀번호의 특수문자는 URL 인코딩하세요.");
        process.exit(1);
    }
    await c.query("set search_path to public");
    return c;
}

// ── 스키마 유틸 ───────────────────────────────────────────────
async function tableExists(c, schema, table) {
    const r = await c.query(
        `select 1 from information_schema.tables where table_schema=$1 and table_name=$2`,
        [schema, table],
    );
    return r.rowCount > 0;
}

async function columns(c, schema, table) {
    const r = await c.query(
        `select column_name, data_type, udt_name, is_nullable, column_default, is_generated
           from information_schema.columns
          where table_schema=$1 and table_name=$2
          order by ordinal_position`,
        [schema, table],
    );
    return r.rows.map((x) => ({
        name: x.column_name,
        type: x.data_type,
        udt: x.udt_name,
        nullable: x.is_nullable === "YES",
        hasDefault: x.column_default != null,
        generated: x.is_generated !== "NEVER",
    }));
}

function castOf(col) {
    if (col.type === "ARRAY") return col.udt.replace(/^_/, "") + "[]";
    if (col.type === "USER-DEFINED") return `"${col.udt}"`;
    if (col.type === "jsonb" || col.type === "json") return col.type;
    return col.udt; // uuid, text, int4, int8, bool, timestamptz …
}

function encode(col, v) {
    if (v == null) return null;
    if (col.type === "jsonb" || col.type === "json") return JSON.stringify(v);
    return v;
}

async function count(c, schema, table) {
    const r = await c.query(`select count(*)::int as n from "${schema}"."${table}"`);
    return r.rows[0].n;
}

async function fetchAll(c, schema, table, cols) {
    const list = cols.map((x) => `"${x.name}"`).join(", ");
    const r = await c.query(`select ${list} from "${schema}"."${table}"`);
    return r.rows;
}

/** 공통 컬럼(생성 컬럼 제외) — 구 DB 에만 있는 컬럼은 버려지므로 경고 */
async function commonColumns(oldC, newC, schema, table) {
    const o = await columns(oldC, schema, table);
    const n = await columns(newC, schema, table);
    const nNames = new Map(n.map((x) => [x.name, x]));
    const common = o.filter((x) => !x.generated && nNames.has(x.name) && !nNames.get(x.name).generated)
        .map((x) => nNames.get(x.name));
    const onlyOld = o.filter((x) => !nNames.has(x.name)).map((x) => x.name);
    const onlyNewRequired = n.filter((x) => !o.find((y) => y.name === x.name) && !x.nullable && !x.hasDefault && !x.generated)
        .map((x) => x.name);
    return { common, onlyOld, onlyNewRequired, oldCols: o, newCols: n };
}

/** INSERT … ON CONFLICT DO NOTHING (또는 DO UPDATE) — 배치. 삽입된 행 수 반환 */
async function insertRows(c, schema, table, cols, rows, conflictCols, { update = null } = {}) {
    if (rows.length === 0) return 0;
    let inserted = 0;
    const colList = cols.map((x) => `"${x.name}"`).join(", ");
    const conflict = conflictCols.map((x) => `"${x}"`).join(", ");
    const action = update
        ? `do update set ${update.map((n) => `"${n}" = excluded."${n}"`).join(", ")}`
        : "do nothing";
    for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const params = [];
        const tuples = chunk.map((row) => {
            const ph = cols.map((col) => {
                params.push(encode(col, row[col.name]));
                return `$${params.length}::${castOf(col)}`;
            });
            return `(${ph.join(", ")})`;
        });
        const r = await c.query(
            `insert into "${schema}"."${table}" (${colList}) values ${tuples.join(", ")}
             on conflict (${conflict}) ${action}`,
            params,
        );
        inserted += r.rowCount;
    }
    return inserted;
}

/** 신 DB 의 CHECK (col = ANY (ARRAY['a','b'])) 에서 허용값 집합을 읽는다. 없으면 null */
async function checkAllowedValues(c, table, column) {
    const r = await c.query(
        `select pg_get_constraintdef(oid) def from pg_constraint
          where contype='c' and conrelid = ('public.' || $1)::regclass and pg_get_constraintdef(oid) like '%' || $2 || '%'`,
        [table, column],
    );
    for (const { def } of r.rows) {
        const m = def.match(/ARRAY\[(.+?)\]/);
        if (!m) continue;
        const vals = [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
        if (vals.length) return new Set(vals);
    }
    return null;
}

const lower = (s) => (s ?? "").toString().trim().toLowerCase();
const fmt = (n) => n.toLocaleString("ko-KR");

// ── inspect ──────────────────────────────────────────────────
async function inspect(oldC, newC) {
    console.log("\n■ 테이블 / 행 수 비교  (구 → 신)");
    const allTables = ["auth.users", "auth.identities", ...PUBLIC_TABLES.map((t) => "public." + t)];
    for (const full of allTables) {
        const [schema, table] = full.split(".");
        const o = (await tableExists(oldC, schema, table)) ? await count(oldC, schema, table) : null;
        const n = (await tableExists(newC, schema, table)) ? await count(newC, schema, table) : null;
        console.log(`  ${full.padEnd(22)} ${String(o ?? "없음").padStart(7)}  →  ${String(n ?? "없음").padStart(7)}`);
    }

    console.log("\n■ 신 DB 에만 있는 public 테이블 (복사 대상 아님, 그대로 둠)");
    const r = await newC.query(
        `select table_name from information_schema.tables
          where table_schema='public' and table_type='BASE TABLE' and table_name <> all($1) order by 1`,
        [PUBLIC_TABLES],
    );
    console.log("  " + (r.rows.map((x) => x.table_name).join(", ") || "(없음)"));

    console.log("\n■ 컬럼 호환성");
    let problems = 0;
    for (const table of PUBLIC_TABLES) {
        if (!(await tableExists(newC, "public", table))) { console.log(`  ✗ ${table}: 신 DB 에 없음`); problems++; continue; }
        if (!(await tableExists(oldC, "public", table))) { console.log(`  - ${table}: 구 DB 에 없음 (건너뜀)`); continue; }
        const { onlyOld, onlyNewRequired, common } = await commonColumns(oldC, newC, "public", table);
        let line = `  ${onlyOld.length || onlyNewRequired.length ? "!" : "✓"} ${table}: 공통 ${common.length}개`;
        if (onlyOld.length) { line += ` | 구에만 있어 버려짐: ${onlyOld.join(", ")}`; problems++; }
        if (onlyNewRequired.length) { line += ` | 신에서 필수인데 기본값 없음: ${onlyNewRequired.join(", ")}`; problems++; }
        console.log(line);
    }
    console.log("\n■ 신 DB 함수 (앱이 호출하는 RPC 가 있어야 함: is_staff, can_settle)");
    const f = await newC.query(
        `select routine_name from information_schema.routines where routine_schema='public' order by 1`,
    );
    console.log("  " + f.rows.map((x) => x.routine_name).join(", "));
    console.log(problems ? `\n⚠ 확인이 필요한 항목 ${problems}개` : "\n✓ 스키마 호환 문제 없음");
}

// ── plan / apply 공통 계산 ─────────────────────────────────────
async function buildPlan(oldC, newC) {
    const plan = { notes: [], renumbered: [], userMerges: [], designerMerges: [] };

    // 1) auth.users
    const uMeta = await commonColumns(oldC, newC, "auth", "users");
    const oldUsers = await fetchAll(oldC, "auth", "users", uMeta.common);
    const newUsers = await fetchAll(newC, "auth", "users", uMeta.common);
    const newById = new Map(newUsers.map((u) => [u.id, u]));
    const newByEmail = new Map(newUsers.filter((u) => u.email).map((u) => [lower(u.email), u]));
    const userMap = new Map(); // old id → new id
    const usersToInsert = [];
    for (const u of oldUsers) {
        if (newById.has(u.id)) { userMap.set(u.id, u.id); continue; }
        const byEmail = u.email ? newByEmail.get(lower(u.email)) : null;
        if (byEmail) {
            userMap.set(u.id, byEmail.id);
            plan.userMerges.push({ email: u.email, oldId: u.id, newId: byEmail.id });
            continue;
        }
        userMap.set(u.id, u.id);
        usersToInsert.push(u);
    }
    const insertedUserIds = new Set(usersToInsert.map((u) => u.id));

    // 2) auth.identities (새로 복사되는 계정 것만)
    let identitiesToInsert = [];
    let iMeta = null;
    if (await tableExists(oldC, "auth", "identities")) {
        iMeta = await commonColumns(oldC, newC, "auth", "identities");
        const oldIds = await fetchAll(oldC, "auth", "identities", iMeta.common);
        identitiesToInsert = oldIds.filter((i) => insertedUserIds.has(i.user_id));
    }

    // 3) profiles
    const pMeta = await commonColumns(oldC, newC, "public", "profiles");
    const oldProfiles = await fetchAll(oldC, "public", "profiles", pMeta.common);
    const newProfiles = await fetchAll(newC, "public", "profiles", pMeta.common);
    const newProfileIds = new Set(newProfiles.map((p) => p.id));
    const profilesNewUsers = []; // 새 계정 → 구 role 적용(upsert)
    const profilesMerged = [];   // 병합 계정 → 신 프로필 없을 때만
    for (const p of oldProfiles) {
        const mapped = userMap.get(p.id);
        if (!mapped) { plan.notes.push(`profiles ${p.id}: 구 auth.users 에 없는 고아 프로필 → 제외`); continue; }
        const row = { ...p, id: mapped };
        if (insertedUserIds.has(mapped)) profilesNewUsers.push(row);
        else if (!newProfileIds.has(mapped)) profilesMerged.push(row);
    }

    // 4) designers
    const dMeta = await commonColumns(oldC, newC, "public", "designers");
    const oldDesigners = await fetchAll(oldC, "public", "designers", dMeta.common);
    const newDesigners = await fetchAll(newC, "public", "designers", dMeta.common);
    const dById = new Map(newDesigners.map((d) => [d.id, d]));
    const dByEmail = new Map(newDesigners.filter((d) => d.email).map((d) => [lower(d.email), d]));
    const dByUser = new Map(newDesigners.filter((d) => d.user_id).map((d) => [d.user_id, d]));
    const dByName = new Map(newDesigners.map((d) => [`${lower(d.name)}|${d.member_type ?? "designer"}`, d]));
    const designerMap = new Map();
    const designersToInsert = [];
    for (const d of oldDesigners) {
        const mappedUser = d.user_id ? userMap.get(d.user_id) ?? null : null;
        let hit = dById.get(d.id) ?? null;
        let how = "id";
        if (!hit && d.email) { hit = dByEmail.get(lower(d.email)) ?? null; how = "email"; }
        if (!hit && mappedUser) { hit = dByUser.get(mappedUser) ?? null; how = "user_id"; }
        if (!hit) { hit = dByName.get(`${lower(d.name)}|${d.member_type ?? "designer"}`) ?? null; how = "name"; }
        if (hit) {
            designerMap.set(d.id, hit.id);
            if (hit.id !== d.id || how !== "id") plan.designerMerges.push({ name: d.name, how, oldId: d.id, newId: hit.id });
            continue;
        }
        designerMap.set(d.id, d.id);
        designersToInsert.push({ ...d, user_id: mappedUser && (newById.has(mappedUser) || insertedUserIds.has(mappedUser)) ? mappedUser : null });
    }
    // 신 DB 의 CHECK 제약(status / member_type)에 걸리는 값은 미리 걸러 둔다 — 트랜잭션 전체가 실패하지 않도록
    for (const colName of ["status", "member_type"]) {
        const allowed = await checkAllowedValues(newC, "designers", colName);
        if (!allowed) continue;
        for (const d of designersToInsert) {
            if (d[colName] != null && !allowed.has(d[colName])) {
                const fallback = colName === "member_type" ? "designer" : null;
                plan.notes.push(`designers "${d.name}": ${colName}='${d[colName]}' 는 신 DB 허용값(${[...allowed].join("/")})이 아니라 ${fallback ?? "NULL"} 로 저장`);
                d[colName] = fallback;
            }
        }
    }

    // 5) app_settings
    const sMeta = await commonColumns(oldC, newC, "public", "app_settings");
    const oldSettings = await fetchAll(oldC, "public", "app_settings", sMeta.common);
    const newSettingKeys = new Set((await fetchAll(newC, "public", "app_settings", [{ name: "key" }])).map((s) => s.key));
    const settingsConflict = oldSettings.filter((s) => newSettingKeys.has(s.key)).map((s) => s.key);

    // 6) tasks
    const tMeta = await commonColumns(oldC, newC, "public", "tasks");
    const oldTasks = await fetchAll(oldC, "public", "tasks", tMeta.common);
    const newTaskRows = await fetchAll(newC, "public", "tasks", [{ name: "id" }, { name: "task_number" }]);
    const newTaskIds = new Set(newTaskRows.map((t) => t.id));
    const usedNumbers = new Set(newTaskRows.map((t) => Number(t.task_number)));
    let nextNumber = Math.max(0, ...newTaskRows.map((t) => Number(t.task_number)), ...oldTasks.map((t) => Number(t.task_number ?? 0))) + 1;
    const tasksToInsert = [];
    for (const t of oldTasks) {
        if (newTaskIds.has(t.id)) continue;
        const row = { ...t };
        if (row.assigned_designer_id) {
            const m = designerMap.get(row.assigned_designer_id);
            if (!m) { plan.notes.push(`task #${t.task_number}: 담당 디자이너 ${row.assigned_designer_id} 를 찾을 수 없어 미배정 처리`); }
            row.assigned_designer_id = m ?? null;
        }
        const n = Number(row.task_number);
        if (row.task_number == null || usedNumbers.has(n)) {
            const fresh = nextNumber++;
            plan.renumbered.push({ id: t.id, from: row.task_number, to: fresh, customer: t.customer_name });
            row.task_number = fresh;
        }
        usedNumbers.add(Number(row.task_number));
        tasksToInsert.push(row);
    }
    const allTaskIds = new Set([...newTaskIds, ...tasksToInsert.map((t) => t.id)]);

    // 7) task_files
    const fMeta = await commonColumns(oldC, newC, "public", "task_files");
    const oldFiles = await fetchAll(oldC, "public", "task_files", fMeta.common);
    const newFileIds = new Set((await fetchAll(newC, "public", "task_files", [{ name: "id" }])).map((f) => f.id));
    const filesToInsert = oldFiles.filter((f) => !newFileIds.has(f.id) && (f.task_id == null || allTaskIds.has(f.task_id)));
    const filesOrphan = oldFiles.length - filesToInsert.length - oldFiles.filter((f) => newFileIds.has(f.id)).length;

    // 8) task_logs
    const lMeta = await commonColumns(oldC, newC, "public", "task_logs");
    const oldLogs = await fetchAll(oldC, "public", "task_logs", lMeta.common);
    const newLogIds = new Set((await fetchAll(newC, "public", "task_logs", [{ name: "id" }])).map((l) => l.id));
    const validUserIds = new Set([...newById.keys(), ...insertedUserIds]);
    const logsToInsert = oldLogs
        .filter((l) => !newLogIds.has(l.id) && (l.task_id == null || allTaskIds.has(l.task_id)))
        .map((l) => {
            const mapped = l.user_id ? userMap.get(l.user_id) ?? null : null;
            return { ...l, user_id: mapped && validUserIds.has(mapped) ? mapped : null };
        });
    const logsOrphan = oldLogs.length - logsToInsert.length - oldLogs.filter((l) => newLogIds.has(l.id)).length;

    return {
        ...plan,
        uMeta, iMeta, pMeta, dMeta, sMeta, tMeta, fMeta, lMeta,
        usersToInsert, identitiesToInsert, profilesNewUsers, profilesMerged,
        designersToInsert, oldSettings, settingsConflict,
        tasksToInsert, filesToInsert, filesOrphan, logsToInsert, logsOrphan,
        counts: {
            oldUsers: oldUsers.length, oldProfiles: oldProfiles.length, oldDesigners: oldDesigners.length,
            oldSettings: oldSettings.length, oldTasks: oldTasks.length, oldFiles: oldFiles.length, oldLogs: oldLogs.length,
        },
        backup: { users: oldUsers, profiles: oldProfiles, designers: oldDesigners, settings: oldSettings, tasks: oldTasks, files: oldFiles, logs: oldLogs },
    };
}

function printPlan(p) {
    const c = p.counts;
    console.log("\n■ 적재 계획  (구 DB 행 수 → 신 DB 에 새로 들어갈 행 수)");
    console.log(`  auth.users      ${fmt(c.oldUsers).padStart(6)} → ${fmt(p.usersToInsert.length).padStart(6)}   (이메일 병합 ${p.userMerges.length})`);
    console.log(`  auth.identities        → ${fmt(p.identitiesToInsert.length).padStart(6)}`);
    console.log(`  profiles        ${fmt(c.oldProfiles).padStart(6)} → ${fmt(p.profilesNewUsers.length + p.profilesMerged.length).padStart(6)}`);
    console.log(`  designers       ${fmt(c.oldDesigners).padStart(6)} → ${fmt(p.designersToInsert.length).padStart(6)}   (같은 사람 병합 ${p.designerMerges.length})`);
    console.log(`  app_settings    ${fmt(c.oldSettings).padStart(6)} → ${fmt(SETTINGS_PREFER === "old" ? p.oldSettings.length : p.oldSettings.length - p.settingsConflict.length).padStart(6)}   (key 충돌 ${p.settingsConflict.length}: ${SETTINGS_PREFER === "old" ? "구 값으로 덮어씀" : "신 값 유지"})`);
    console.log(`  tasks           ${fmt(c.oldTasks).padStart(6)} → ${fmt(p.tasksToInsert.length).padStart(6)}   (번호 재발급 ${p.renumbered.length})`);
    console.log(`  task_files      ${fmt(c.oldFiles).padStart(6)} → ${fmt(p.filesToInsert.length).padStart(6)}   (고아 제외 ${p.filesOrphan})`);
    console.log(`  task_logs       ${fmt(c.oldLogs).padStart(6)} → ${fmt(p.logsToInsert.length).padStart(6)}   (고아 제외 ${p.logsOrphan})`);

    const dropped = [["profiles", p.pMeta], ["designers", p.dMeta], ["app_settings", p.sMeta], ["tasks", p.tMeta], ["task_files", p.fMeta], ["task_logs", p.lMeta]]
        .filter(([, m]) => m.onlyOld.length);
    if (dropped.length) {
        console.log("\n⚠ 구 DB 에만 있어 복사되지 않는 컬럼");
        for (const [t, m] of dropped) console.log(`  ${t}: ${m.onlyOld.join(", ")}`);
    }
    if (p.userMerges.length) {
        console.log("\n■ 이메일이 같아 신 계정으로 병합되는 사용자 (비밀번호는 신 프로젝트 것 유지)");
        for (const m of p.userMerges) console.log(`  ${m.email}  ${m.oldId} → ${m.newId}`);
    }
    if (p.designerMerges.length) {
        console.log("\n■ 같은 사람으로 판단해 병합되는 디자이너");
        for (const m of p.designerMerges) console.log(`  ${m.name} (${m.how} 일치)  ${m.oldId} → ${m.newId}`);
    }
    if (p.renumbered.length) {
        console.log("\n■ task_number 충돌로 새 번호를 받는 작업");
        for (const r of p.renumbered.slice(0, 50)) console.log(`  #${r.from} → #${r.to}  ${r.customer}`);
        if (p.renumbered.length > 50) console.log(`  … 외 ${p.renumbered.length - 50}건`);
    }
    if (p.settingsConflict.length) console.log(`\n■ app_settings 충돌 key: ${p.settingsConflict.join(", ")}`);
    if (p.notes.length) {
        console.log("\n■ 참고");
        for (const n of p.notes) console.log("  - " + n);
    }
}

// ── apply ────────────────────────────────────────────────────
async function apply(oldC, newC, p) {
    // 백업: 구 DB 전체 스냅샷을 JSON 으로 남긴다
    const dir = path.join(__dirname, "backup");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `old-snapshot-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(p.backup, null, 0));
    console.log(`\n구 DB 스냅샷 저장: ${file}`);

    // 롤백용: 적재 직전 신 DB 에 이미 있던 키 목록 (rollback.mjs 가 이 목록을 제외하고 삭제)
    const pre = {};
    pre.users = (await newC.query("select id from auth.users")).rows.map((r) => r.id);
    pre.identities = (await newC.query("select provider_id, provider from auth.identities")).rows.map((r) => `${r.provider_id}|${r.provider}`);
    for (const t of ["profiles", "designers", "tasks", "task_files", "task_logs"]) pre[t] = (await newC.query(`select id from public.${t}`)).rows.map((r) => r.id);
    pre.settings = (await newC.query("select key from public.app_settings")).rows.map((r) => r.key);
    const preFile = path.join(dir, `new-preexisting-${stamp}.json`);
    fs.writeFileSync(preFile, JSON.stringify(pre));
    console.log(`신 DB 기존 키 목록 저장: ${preFile}`);

    await newC.query("begin");
    try {
        const r = {};
        r.users = await insertRows(newC, "auth", "users", p.uMeta.common, p.usersToInsert, PK["auth.users"]);
        if (p.iMeta) r.identities = await insertRows(newC, "auth", "identities", p.iMeta.common, p.identitiesToInsert, PK["auth.identities"]);

        // 새 계정 프로필: auth.users 트리거가 기본 프로필을 만들었을 수 있으므로 role/name 을 구 값으로 맞춘다
        const updatable = p.pMeta.common.map((c) => c.name).filter((n) => n !== "id");
        r.profilesNew = await insertRows(newC, "public", "profiles", p.pMeta.common, p.profilesNewUsers, PK["public.profiles"], { update: updatable });
        r.profilesMerged = await insertRows(newC, "public", "profiles", p.pMeta.common, p.profilesMerged, PK["public.profiles"]);

        r.designers = await insertRows(newC, "public", "designers", p.dMeta.common, p.designersToInsert, PK["public.designers"]);

        const sUpdate = SETTINGS_PREFER === "old" ? p.sMeta.common.map((c) => c.name).filter((n) => n !== "key") : null;
        r.settings = await insertRows(newC, "public", "app_settings", p.sMeta.common, p.oldSettings, PK["public.app_settings"], { update: sUpdate });

        r.tasks = await insertRows(newC, "public", "tasks", p.tMeta.common, p.tasksToInsert, PK["public.tasks"]);
        r.files = await insertRows(newC, "public", "task_files", p.fMeta.common, p.filesToInsert, PK["public.task_files"]);
        r.logs = await insertRows(newC, "public", "task_logs", p.lMeta.common, p.logsToInsert, PK["public.task_logs"]);

        // task_number 시퀀스를 최대값 뒤로
        await newC.query(
            `select setval(pg_get_serial_sequence('public.tasks','task_number'),
                           coalesce((select max(task_number) from public.tasks), 0) + 1, false)`,
        );
        await newC.query("commit");
        console.log("\n✓ 적재 완료 (삽입/갱신 행 수)");
        for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(15)} ${fmt(v)}`);
    } catch (e) {
        await newC.query("rollback");
        console.error("\n✗ 실패 — 전부 롤백했습니다. 신 DB 는 변경되지 않았습니다.");
        console.error("  " + e.message);
        if (e.detail) console.error("  " + e.detail);
        process.exit(1);
    }
}

// ── verify ───────────────────────────────────────────────────
async function verify(oldC, newC) {
    console.log("\n■ 행 수 (구 / 신)");
    for (const t of ["profiles", "designers", "app_settings", "tasks", "task_files", "task_logs"]) {
        const o = await count(oldC, "public", t);
        const n = await count(newC, "public", t);
        console.log(`  ${t.padEnd(14)} ${fmt(o).padStart(7)} / ${fmt(n).padStart(7)} ${n >= o ? "" : "  ⚠ 신 DB 가 더 적음"}`);
    }
    console.log("\n■ 구 DB 작업 중 신 DB 에 없는 id");
    const oldIds = (await oldC.query("select id from public.tasks")).rows.map((r) => r.id);
    const missing = (await newC.query("select id from unnest($1::uuid[]) id where id not in (select id from public.tasks)", [oldIds])).rows;
    console.log(`  ${missing.length}건${missing.length ? ": " + missing.slice(0, 10).map((m) => m.id).join(", ") : ""}`);

    console.log("\n■ 신 DB 무결성");
    const checks = [
        ["task_number 중복", "select count(*)::int n from (select task_number from public.tasks group by 1 having count(*)>1) x"],
        ["담당자 없는 배정", "select count(*)::int n from public.tasks t where assigned_designer_id is not null and not exists (select 1 from public.designers d where d.id=t.assigned_designer_id)"],
        ["계정 없는 designers.user_id", "select count(*)::int n from public.designers d where user_id is not null and not exists (select 1 from auth.users u where u.id=d.user_id)"],
        ["프로필 없는 계정", "select count(*)::int n from auth.users u where not exists (select 1 from public.profiles p where p.id=u.id)"],
        ["이메일 중복 계정", "select count(*)::int n from (select lower(email) from auth.users where email is not null group by 1 having count(*)>1) x"],
    ];
    for (const [label, sql] of checks) {
        const n = (await newC.query(sql)).rows[0].n;
        console.log(`  ${n === 0 ? "✓" : "⚠"} ${label}: ${n}`);
    }
    const seq = (await newC.query("select last_value, is_called from public.tasks_task_number_seq")).rows[0];
    const mx = (await newC.query("select coalesce(max(task_number),0)::int m from public.tasks")).rows[0].m;
    console.log(`  ${Number(seq.last_value) > mx || (Number(seq.last_value) === mx && seq.is_called) ? "✓" : "⚠"} task_number 시퀀스 ${seq.last_value} (최대 ${mx})`);
}

// ── main ─────────────────────────────────────────────────────
const oldC = await connect(process.env.OLD_DB_URL, "구 DB");
const newC = await connect(process.env.NEW_DB_URL, "신 DB");
try {
    const oldRef = (await oldC.query("select current_database() db, inet_server_addr()::text host")).rows[0];
    console.log(`구 DB 연결됨 (${new URL(process.env.OLD_DB_URL).username})  /  신 DB 연결됨 (${new URL(process.env.NEW_DB_URL).username})`);
    if (process.env.OLD_DB_URL === process.env.NEW_DB_URL) { console.error("OLD_DB_URL 과 NEW_DB_URL 이 같습니다."); process.exit(1); }
    void oldRef;

    if (cmd === "inspect") await inspect(oldC, newC);
    if (cmd === "plan") printPlan(await buildPlan(oldC, newC));
    if (cmd === "apply") {
        const p = await buildPlan(oldC, newC);
        printPlan(p);
        if (!YES) { console.log("\n위 계획대로 실행하려면 --yes 를 붙이세요:  node migrate.mjs apply --yes"); }
        else await apply(oldC, newC, p);
    }
    if (cmd === "verify") await verify(oldC, newC);
} finally {
    await oldC.end();
    await newC.end();
}
