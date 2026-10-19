// rollback.mjs — migrate.mjs apply 가 신 DB 에 넣은 행만 골라 삭제한다.
//
//   node rollback.mjs plan                 # 삭제될 행 수 미리보기 (쓰기 없음)
//   node rollback.mjs apply --yes          # 단일 트랜잭션으로 삭제
//   node rollback.mjs plan --stamp <시각>   # backup/ 에 스냅샷이 여러 개면 지정
//
// 원리: backup/old-snapshot-<시각>.json (구 DB 전체) 에서
//       backup/new-preexisting-<시각>.json (적재 직전 신 DB 에 있던 키) 를 뺀 것 = 적재가 새로 넣은 행.
// 주의: 전환 직후에만 쓰는 용도. 전환 뒤 신 사이트에서 구 작업에 로그·파일·외주 메시지를 달았다면
//       작업 삭제 시 FK cascade 로 함께 사라진다 (plan 에서 경고로 표시).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env.migration") });

const cmd = process.argv[2];
const yes = process.argv.includes("--yes");
const stampArg = (() => { const i = process.argv.indexOf("--stamp"); return i > 0 ? process.argv[i + 1] : null; })();
if (!["plan", "apply"].includes(cmd)) { console.error("사용법: node rollback.mjs plan | apply --yes [--stamp <시각>]"); process.exit(1); }
if (!process.env.NEW_DB_URL) { console.error("NEW_DB_URL 이 없습니다."); process.exit(1); }

const dir = path.join(__dirname, "backup");
const snaps = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("old-snapshot-")).sort() : [];
if (!snaps.length) { console.error("backup/ 에 old-snapshot-*.json 이 없습니다."); process.exit(1); }
const stamp = stampArg ?? snaps.at(-1).replace(/^old-snapshot-|\.json$/g, "");
const snapFile = path.join(dir, `old-snapshot-${stamp}.json`);
const preFile = path.join(dir, `new-preexisting-${stamp}.json`);
for (const f of [snapFile, preFile]) if (!fs.existsSync(f)) { console.error(`없음: ${f}`); process.exit(1); }
console.log(`스냅샷 시각: ${stamp}`);

const snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));
const pre = JSON.parse(fs.readFileSync(preFile, "utf8"));
const minus = (arr, set) => arr.filter((x) => !set.has(x));

const target = {
    logs: minus(snap.logs.map((r) => r.id), new Set(pre.task_logs)),
    files: minus(snap.files.map((r) => r.id), new Set(pre.task_files)),
    tasks: minus(snap.tasks.map((r) => r.id), new Set(pre.tasks)),
    designers: minus(snap.designers.map((r) => r.id), new Set(pre.designers)),
    profiles: minus(snap.profiles.map((r) => r.id), new Set(pre.profiles)),
    users: minus(snap.users.map((r) => r.id), new Set(pre.users)),
};

const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.NEW_DB_URL);
const c = new pg.Client({ connectionString: process.env.NEW_DB_URL, ssl: isLocal ? false : { rejectUnauthorized: false }, statement_timeout: 0 });
await c.connect();
console.log(`신 DB 연결됨 (${new URL(process.env.NEW_DB_URL).username})\n`);

// 실제로 신 DB 에 존재하는 것만 센다
const Q = {
    logs: "select count(*)::int n from public.task_logs where id = any($1::uuid[])",
    files: "select count(*)::int n from public.task_files where id = any($1::uuid[])",
    tasks: "select count(*)::int n from public.tasks where id = any($1::uuid[])",
    designers: "select count(*)::int n from public.designers where id = any($1::uuid[])",
    profiles: "select count(*)::int n from public.profiles where id = any($1::uuid[])",
    users: "select count(*)::int n from auth.users where id = any($1::uuid[])",
};
console.log("■ 삭제 대상 (적재가 새로 넣은 행 중 현재 신 DB 에 있는 것)");
for (const k of Object.keys(target)) {
    const n = target[k].length ? (await c.query(Q[k], [target[k]])).rows[0].n : 0;
    console.log(`  ${k.padEnd(10)} ${String(n).padStart(7)}  (스냅샷 기준 ${target[k].length})`);
}

// 전환 뒤 신 사이트가 구 작업에 붙인 데이터가 있으면 경고 (작업 삭제 시 FK cascade 로 같이 사라짐)
const taskIds = target.tasks;
if (taskIds.length) {
    const dep = await c.query(
        `select 'task_logs(전환 후 신규)' k, count(*)::int n from public.task_logs where task_id = any($1::uuid[]) and not (id = any($2::uuid[]))
         union all select 'task_files(전환 후 신규)', count(*)::int from public.task_files where task_id = any($1::uuid[]) and not (id = any($3::uuid[]))
         union all select 'outsourcing_messages', count(*)::int from public.outsourcing_messages where task_id = any($1::uuid[])
         union all select 'notification_outbox(task_id 만 null 처리)', count(*)::int from public.notification_outbox where task_id = any($1::uuid[])`,
        [taskIds, target.logs, target.files],
    );
    const warn = dep.rows.filter((r) => r.n > 0);
    if (warn.length) {
        console.log("\n⚠ 전환 뒤 구 작업에 새로 붙은 데이터가 있습니다:");
        for (const r of warn) console.log(`  ${r.k}: ${r.n}`);
    }
}

if (cmd === "plan") { console.log("\n(plan 모드: 아무것도 변경하지 않았습니다)"); await c.end(); process.exit(0); }
if (!yes) { console.error("\napply 는 --yes 가 필요합니다."); await c.end(); process.exit(1); }

await c.query("begin");
try {
    const del = async (sql, ids) => (ids.length ? (await c.query(sql, [ids])).rowCount : 0);
    const r = {};
    // tasks 삭제 → task_files / task_logs / outsourcing_messages 는 cascade, notification_outbox.task_id 는 null
    r.task_logs = await del("delete from public.task_logs where id = any($1::uuid[])", target.logs);
    r.task_files = await del("delete from public.task_files where id = any($1::uuid[])", target.files);
    r.tasks = await del("delete from public.tasks where id = any($1::uuid[])", taskIds);
    r.designers = await del("delete from public.designers where id = any($1::uuid[])", target.designers);
    r.profiles = await del("delete from public.profiles where id = any($1::uuid[])", target.profiles);
    // auth.users 삭제 → auth.identities / profiles / chat_room_members / staff_contacts 는 cascade
    r.users = await del("delete from auth.users where id = any($1::uuid[])", target.users);
    await c.query(`select setval(pg_get_serial_sequence('public.tasks','task_number'), coalesce((select max(task_number) from public.tasks), 0) + 1, false)`);
    await c.query("commit");
    console.log("\n✓ 롤백 완료 (삭제 행 수)");
    for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(12)} ${v}`);
} catch (e) {
    await c.query("rollback");
    console.error("\n✗ 실패 — 전부 되돌렸습니다. 신 DB 는 변경되지 않았습니다.");
    console.error("  " + e.message);
    if (e.detail) console.error("  " + e.detail);
    process.exit(1);
}
await c.end();
