// src/lib/chat/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_ATTACHMENTS } from "@/types/database";

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type RoomKind = "channel" | "dm";

export interface ChatRoom {
    id: string;
    kind: RoomKind;
    /** 화면에 띄울 이름. channel 은 room.name, dm 은 상대 이름 */
    title: string;
    /** dm 일 때 상대. channel 이면 null */
    peer: { userId: string; name: string; avatarUrl: string | null } | null;
    unread: number;
    lastBody: string | null;
    lastAt: string | null;
    memberIds: string[];
}

export interface ChatMessage {
    id: string;
    room_id: string;
    author_id: string;
    author_name: string;
    body: string | null;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    attachments: ChatAttachment[] | null;
}

export interface ChatAttachment {
    url: string;
    name: string;
    size: number;
    mime: string;
    w?: number;
    h?: number;
}

export interface RosterUser {
    userId: string;
    name: string;
    role: string;
    memberType: string | null;
    avatarUrl: string | null;
    /** 본인이 고르는 업무 상태('여유'/'바쁨'). 접속 여부와 다른 축이다 */
    workStatus: string | null;
}

export interface RoomMember {
    userId: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    /** 방을 만든 사람 */
    isOwner: boolean;
    /** 나 자신 */
    isMe: boolean;
}

export type RoomMembersResult =
    | { ok: true; members: RoomMember[] }
    | { ok: false; message: string };

export type RosterResult =
    | { ok: true; users: RosterUser[] }
    | { ok: false; message: string };

export type OpenDmResult =
    | { ok: true; roomId: string }
    | { ok: false; message: string };

const MSG_SELECT =
    "id, room_id, author_id, author_name, body, created_at, edited_at, deleted_at, attachments";

// ─────────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────────

/**
 * 채팅은 역할을 가리지 않는다. 로그인만 확인한다.
 *
 * assertStaff(supabase, userId) 도 assertOutsourcing() 도 안 맞아서 따로 둔다.
 * 반환 형태는 assertOutsourcing 쪽을 따랐다.
 */
async function assertUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    return { supabase, admin: createAdminClient(), userId: user.id };
}

/**
 * 사내(admin/designer/cs)인가?
 *
 * profiles.role 을 여기서 다시 읽지 않고 SQL 함수를 부른다.
 * 역할 목록이 바뀌어도 SQL 한 곳만 고치면 되고,
 * profiles 가 자기 행만 읽히는 지금 구조에서도 SECURITY DEFINER 라 통과한다.
 */
async function isStaff(
    supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_staff");
    if (error) throw new Error(`권한 확인 실패: ${error.message}`);
    return data === true;
}

/** 표시 이름 3단 폴백. designers → profiles → 대체 문구 (v5 문서 2-3) */
function displayName(
    designerName?: string | null,
    profileName?: string | null,
): string {
    return designerName ?? profileName ?? "(이름 없음)";
}

/**
 * 여러 사람의 표시 정보를 한 번에 가져온다.
 *
 * ★ 반드시 admin. profiles 정책이 profiles_select_own 하나뿐이라
 *   일반 클라이언트로는 남의 행이 조용히 빈 배열로 온다 (v5 문서 5-1 ③ 유형).
 */
async function loadPeople(
    admin: ReturnType<typeof createAdminClient>,
    userIds: string[],
): Promise<Map<string, RosterUser>> {
    const map = new Map<string, RosterUser>();
    if (userIds.length === 0) return map;

    const [profRes, desRes] = await Promise.all([
        admin.from("profiles").select("id, name, role").in("id", userIds),
        admin
            .from("designers")
            .select("user_id, name, avatar_url, member_type, status")
            .in("user_id", userIds),
    ]);

    const desByUser = new Map(
        (desRes.data ?? []).map((d) => [d.user_id as string, d]),
    );

    for (const p of profRes.data ?? []) {
        const d = desByUser.get(p.id as string);
        map.set(p.id as string, {
            userId: p.id as string,
            name: displayName(d?.name as string | undefined, p.name as string | null),
            role: p.role as string,
            memberType: (d?.member_type as string) ?? null,
            avatarUrl: (d?.avatar_url as string) ?? null,
            workStatus: (d?.status as string) ?? null,
        });
    }
    return map;
}

/** 두 사람 사이의 DM 키. 순서를 고정해야 중복 방을 DB 가 막을 수 있다 */
function dmKeyOf(a: string, b: string) {
    return [a, b].sort().join(":");
}



/**
 * 빠진 멤버를 다시 넣는다. 이미 있는 사람은 건드리지 않는다.
 *
 * last_read_at 을 지금으로 잡는 게 핵심이다. 기본값으로 두면
 * 나가 있던 동안의 메시지가 전부 안 읽음으로 잡혀 뱃지가 폭발한다.
 */
async function ensureMembers(
    admin: ReturnType<typeof createAdminClient>,
    roomId: string,
    userIds: string[],
) {
    const { error } = await admin
        .from("chat_room_members")
        .upsert(
            userIds.map((id) => ({
                room_id: roomId,
                user_id: id,
                last_read_at: new Date().toISOString(),
            })),
            { onConflict: "room_id,user_id", ignoreDuplicates: true },
        );
    if (error) throw new Error(`대화 상대 등록 실패: ${error.message}`);
}

/**
 * DM 에서 상대가 대화를 지웠으면 다시 멤버로 넣는다.
 *
 * ★ dm_key 에 두 사람의 uuid 가 정렬돼 들어 있다. 멤버십이 지워져도
 *   여기서 누구였는지 복원할 수 있다 (4-8).
 *   메시지의 author_id 로 찾으면 상대가 한 마디도 안 한 방에서는 실패한다.
 *
 * channel 은 건드리지 않는다. 거기서 나가기는 진짜 탈퇴다.
 */
async function reviveRoomIfNeeded(
    admin: ReturnType<typeof createAdminClient>,
    roomId: string,
    userId: string,
) {
    const { data: room } = await admin
        .from("chat_rooms")
        .select("kind, dm_key, archived_at")
        .eq("id", roomId)
        .maybeSingle();
    if (!room || room.kind !== "dm" || !room.dm_key) return;

    const pair = (room.dm_key as string).split(":");
    if (pair.length !== 2) return;

    const { data: members } = await admin
        .from("chat_room_members")
        .select("user_id")
        .eq("room_id", roomId);

    const have = new Set((members ?? []).map((m) => m.user_id as string));
    const missing = pair.filter((id) => !have.has(id));
    if (missing.length === 0) return;

    // 내가 빠져 있다면 내가 보내는 상황이 아니다. 안전장치
    if (!have.has(userId) && !missing.includes(userId)) return;

    await ensureMembers(admin, roomId, missing);

    if (room.archived_at) {
        await admin.from("chat_rooms")
            .update({ archived_at: null })
            .eq("id", roomId);
    }
}

// ─────────────────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────────────────

/**
 * 내 방 목록. 안 읽은 수와 마지막 메시지 미리보기 포함.
 *
 * 안 읽은 수는 저장하지 않고 last_read_at 기준으로 그때그때 센다.
 * 저장하면 계속 맞춰줘야 하고 어긋나면 v5 문서 5-1 ⑨ 가 재발한다.
 */
export async function fetchMyRooms(): Promise<ChatRoom[]> {
    const { supabase, admin, userId } = await assertUser();

    // 내 멤버십 (RLS: is_room_member 로 내 방만 온다)
    const { data: mine, error: mineErr } = await supabase
        .from("chat_room_members")
        .select("room_id, last_read_at")
        .eq("user_id", userId);
    if (mineErr) throw new Error(`방 목록 조회 실패: ${mineErr.message}`);

    const roomIds = (mine ?? []).map((m) => m.room_id as string);
    if (roomIds.length === 0) return [];

    const readAt = new Map(
        (mine ?? []).map((m) => [m.room_id as string, m.last_read_at as string]),
    );

    const { data: rooms, error: roomErr } = await supabase
        .from("chat_rooms")
        .select("id, kind, name, dm_key, archived_at")
        .in("id", roomIds)
        .is("archived_at", null);
    if (roomErr) throw new Error(`방 조회 실패: ${roomErr.message}`);

    // DM 상대를 찾기 위해 전체 멤버가 필요하다.
    // admin 을 쓰는 이유는 이름 해석 때문이지 멤버십 자체는 RLS 로도 보인다.
    const { data: allMembers } = await admin
        .from("chat_room_members")
        .select("room_id, user_id")
        .in("room_id", roomIds);

    // 상대가 대화를 지운 방은 멤버십에 안 남아 있기 때문
    const peerSet = new Set(
        (allMembers ?? [])
            .filter((m) => m.user_id !== userId)
            .map((m) => m.user_id as string),
    );
    for (const r of rooms ?? []) {
        const key = r.dm_key as string | null;
        if (!key) continue;
        for (const id of key.split(":")) {
            if (id !== userId) peerSet.add(id);
        }
    }
    const people = await loadPeople(admin, Array.from(peerSet));

    // 안 읽은 수 — 방마다 정확히 센다.
    // 방이 수십 개가 되면 SQL 함수 하나로 합치는 게 낫다.
    const unreadList = await Promise.all(
        roomIds.map(async (rid) => {
            const { count } = await supabase
                .from("chat_messages")
                .select("id", { count: "exact", head: true })
                .eq("room_id", rid)
                .is("deleted_at", null)
                .neq("author_id", userId)          // 내가 쓴 건 안 읽음이 아니다
                .gt("created_at", readAt.get(rid) ?? new Date(0).toISOString());
            return [rid, count ?? 0] as const;
        }),
    );
    const unreadBy = new Map(unreadList);

    // 마지막 메시지 미리보기 — 한 번에 긁어서 방별로 첫 줄만 쓴다
    const { data: recent } = await supabase
        .from("chat_messages")
        .select("room_id, body, created_at, deleted_at, author_id, author_name, attachments")
        .in("room_id", roomIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);

    const lastBy = new Map<string, { body: string; at: string }>();
    for (const m of recent ?? []) {
        const rid = m.room_id as string;
        if (!lastBy.has(rid)) {
            const atts = (m.attachments as ChatAttachment[] | null) ?? [];
            const text = (m.body as string | null)?.trim();
            // 글이 있으면 글, 없으면 첨부 요약. 방 목록에 빈 줄이 남으면 안 된다
            const preview = text
                ? text
                : atts.length === 0 ? ""
                    : atts.every((a) => a.mime?.startsWith("image/"))
                        ? `사진 ${atts.length}장`
                        : `파일 ${atts.length}개`;
            lastBy.set(rid, { body: preview, at: m.created_at as string });
        }
    }

    const memberByRoom = new Map<string, string[]>();
    for (const m of allMembers ?? []) {
        const rid = m.room_id as string;
        memberByRoom.set(rid, [...(memberByRoom.get(rid) ?? []), m.user_id as string]);
    }

    const out: ChatRoom[] = (rooms ?? []).map((r) => {
        const rid = r.id as string;
        const kind = r.kind as RoomKind;

        let peer: ChatRoom["peer"] = null;
        let dmTitle = "(알 수 없음)";

        if (kind === "dm") {
            // 멤버십이 아니라 dm_key 로 상대를 찾는다.
            // 상대가 대화를 지워도 dm_key 에는 두 사람이 그대로 남아 있어
            // 이름과 아바타를 계속 보여줄 수 있다 (4-8)
            const fromKey = (r.dm_key as string | null)?.split(":") ?? [];
            const other = fromKey.find((u) => u !== userId)
                ?? (memberByRoom.get(rid) ?? []).find((u) => u !== userId);

            const p = other ? people.get(other) : undefined;
            if (p) {
                peer = { userId: p.userId, name: p.name, avatarUrl: p.avatarUrl };
                dmTitle = p.name;
            }
        }

        const last = lastBy.get(rid);
        return {
            id: rid,
            kind,
            title: kind === "channel" ? ((r.name as string) ?? "(이름 없는 방)") : dmTitle,
            peer,
            unread: unreadBy.get(rid) ?? 0,
            lastBody: last?.body ?? null,
            lastAt: last?.at ?? null,
            memberIds: memberByRoom.get(rid) ?? [],
        };
    });

    // 안 읽은 방 먼저, 그다음 최근 순
    out.sort((a, b) => {
        if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
        return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    });

    return out;
}

/**
 * 초대·DM 대상 명단.
 *
 * ★ 사내만 부를 수 있다. 외주는 전체 명단을 보지 못한다.
 *   외주가 DM 을 걸 상대는 접속 바에 뜬 사람이지 명단이 아니다.
 */
export async function fetchRoster(): Promise<RosterResult> {
    const { supabase, admin, userId } = await assertUser();
    if (!(await isStaff(supabase))) {
        return { ok: false, message: "명단을 볼 권한이 없습니다." };
    }

    // 기준 테이블은 profiles 다. designers 는 부가 정보를 붙이는 쪽 (v5 문서 2-3)
    const { data: profiles, error } = await admin
        .from("profiles")
        .select("id, name, role")
        .neq("id", userId);
    if (error) throw new Error(`명단 조회 실패: ${error.message}`);

    const ids = (profiles ?? []).map((p) => p.id as string);
    const people = await loadPeople(admin, ids);

    // designers 행이 없거나 is_active 가 NULL 인 사람도 빠지면 안 된다
    const { data: inactive } = await admin
        .from("designers")
        .select("user_id")
        .eq("is_active", false);
    const inactiveSet = new Set((inactive ?? []).map((d) => d.user_id as string));

    return {
        ok: true,
        users: ids
            .map((id) => people.get(id))
            .filter((u): u is RosterUser => !!u && !inactiveSet.has(u.userId))
            .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    };
}

/** 방 하나의 메시지. 여는 순간 읽음 처리한다. */
export async function fetchRoomMessages(roomId: string): Promise<ChatMessage[]> {
    const { supabase, userId } = await assertUser();

    // RLS(chat_messages_select)가 내 방만 통과시킨다.
    // 남의 방 id 를 넣어도 빈 배열이 온다
    const { data, error } = await supabase
        .from("chat_messages")
        .select(MSG_SELECT)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(500);
    if (error) throw new Error(`메시지 조회 실패: ${error.message}`);

    await supabase
        .from("chat_room_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId);

    return (data ?? []) as unknown as ChatMessage[];
}

/**
 * 방의 현재 참여자.
 *
 * ★ 사내 전용이 아니다. 외주도 자기가 속한 방의 참여자는 볼 수 있어야 한다.
 *   그래서 isStaff() 가 아니라 "내가 이 방 멤버인가" 로 검사한다.
 *
 * 이름 해석은 admin 으로 간다. profiles 가 자기 행만 읽히므로
 * RLS 클라이언트로는 남의 이름이 조용히 비어서 온다 (5-2 ⑳).
 */
export async function fetchRoomMembers(
    roomId: string,
): Promise<RoomMembersResult> {
    const { admin, userId } = await assertUser();

    const { data: rows, error } = await admin
        .from("chat_room_members")
        .select("user_id")
        .eq("room_id", roomId);
    if (error) throw new Error(`참여자 조회 실패: ${error.message}`);

    const ids = (rows ?? []).map((r) => r.user_id as string);
    if (!ids.includes(userId)) {
        return { ok: false, message: "참여 중인 방이 아닙니다." };
    }

    const { data: room } = await admin
        .from("chat_rooms")
        .select("created_by")
        .eq("id", roomId)
        .maybeSingle();
    const owner = (room?.created_by as string | null) ?? null;

    const people = await loadPeople(admin, ids);

    const members = ids
        .map((id) => people.get(id))
        .filter((u): u is RosterUser => !!u)
        .map((u) => ({
            userId: u.userId,
            name: u.name,
            role: u.role,
            avatarUrl: u.avatarUrl,
            isOwner: u.userId === owner,
            isMe: u.userId === userId,
        }));

    // 나 → 방장 → 이름순
    members.sort((a, b) => {
        if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.name.localeCompare(b.name, "ko");
    });

    return { ok: true, members };
}

// ─────────────────────────────────────────────────────────────
// 쓰기
// ─────────────────────────────────────────────────────────────

/**
 * DM 방을 찾거나 만든다.
 *
 * 규칙: 두 사람 중 최소 한 명은 사내여야 한다.
 *   - 사내 → 누구나 (사내·외주)
 *   - 외주 → 사내만
 *   - 외주 → 외주 차단
 *
 * CHECK 제약으로는 못 쓴다(다른 테이블을 봐야 하므로). 여기서 막는다.
 * 방 생성이 서버 액션 전용이라 우회로가 없다.
 */
export async function openDirectMessage(peerId: string): Promise<OpenDmResult> {
    const { admin, userId } = await assertUser();
    if (peerId === userId) {
        return { ok: false, message: "자기 자신과는 대화할 수 없습니다." };
    }

    const { data: pair, error: pairErr } = await admin
        .from("profiles")
        .select("id, role")
        .in("id", [userId, peerId]);
    // 쿼리 자체가 터진 건 코드/인프라 문제다. 이건 throw 가 맞다
    if (pairErr) throw new Error(`상대 확인 실패: ${pairErr.message}`);
    if ((pair ?? []).length !== 2) {
        return { ok: false, message: "상대를 찾을 수 없습니다." };
    }

    const staffRoles = ["admin", "designer", "cs"];
    const anyStaff = (pair ?? []).some((p) => staffRoles.includes(p.role as string));
    if (!anyStaff) {
        return { ok: false, message: "외주 작업자끼리는 대화할 수 없습니다." };
    }

    const key = dmKeyOf(userId, peerId);

    // 이미 있으면 그대로 쓴다
    // 이미 있으면 그대로 쓴다
    const { data: existing } = await admin
        .from("chat_rooms")
        .select("id")
        .eq("dm_key", key)
        .maybeSingle();

    if (existing) {
        const rid = existing.id as string;
        // 둘 다 나가서 접힌 방이면 다시 편다
        await admin.from("chat_rooms")
            .update({ archived_at: null })
            .eq("id", rid)
            .not("archived_at", "is", null);
        await ensureMembers(admin, rid, [userId, peerId]);
        return { ok: true, roomId: rid };
    }

    const { data: room, error: roomErr } = await admin
        .from("chat_rooms")
        .insert({ kind: "dm", dm_key: key, created_by: userId })
        .select("id")
        .single();

    if (roomErr) {
        // 23505 = unique_violation. 두 사람이 동시에 눌렀다.
        // UNIQUE 인덱스가 막아준 것이므로 이미 만들어진 방을 다시 찾는다
        if (roomErr.code === "23505") {
            const { data: raced } = await admin
                .from("chat_rooms").select("id").eq("dm_key", key).maybeSingle();
            if (raced) return { ok: true, roomId: raced.id as string };
        }
        throw new Error(`대화방 생성 실패: ${roomErr.message}`);
    }

    const roomId = room.id as string;
    const { error: memErr } = await admin.from("chat_room_members").insert([
        { room_id: roomId, user_id: userId },
        { room_id: roomId, user_id: peerId },
    ]);
    if (memErr) {
        // 멤버가 없으면 아무도 못 보는 유령 방이 된다. 되돌린다
        await admin.from("chat_rooms").delete().eq("id", roomId);
        throw new Error(`대화 상대 등록 실패: ${memErr.message}`);
    }

    return {ok: true, roomId};
}

/** 채널 생성. 사내만. 만든 사람은 자동으로 멤버가 된다. */
export async function createChannel(
    name: string,
    memberIds: string[],
): Promise<CreateChannelResult> {
    const { supabase, admin, userId } = await assertUser();
    if (!(await isStaff(supabase))) {
        return { ok: false, message: "채팅방을 만들 권한이 없습니다." };
    }

    const title = name.trim();
    if (!title) return { ok: false, message: "방 이름을 입력해주세요." };
    if (title.length > 40) return { ok: false, message: "방 이름이 너무 깁니다." };

    const ids = Array.from(new Set([userId, ...memberIds]));
    if (ids.length < 2) {
        return { ok: false, message: "함께할 사람을 한 명 이상 선택해주세요." };
    }

    const { data: room, error } = await admin
        .from("chat_rooms")
        .insert({ kind: "channel", name: title, created_by: userId })
        .select("id")
        .single();
    if (error) throw new Error(`채팅방 생성 실패: ${error.message}`);

    const roomId = room.id as string;

    const { error: memErr } = await admin
        .from("chat_room_members")
        .insert(ids.map((id) => ({ room_id: roomId, user_id: id })));
    if (memErr) {
        await admin.from("chat_rooms").delete().eq("id", roomId);
        throw new Error(`참여자 등록 실패: ${memErr.message}`);
    }

    return { ok: true, roomId };
}

/** 방에 사람 추가. 사내만. */
export async function inviteToRoom(
    roomId: string,
    memberIds: string[],
): Promise<InviteResult> {
    const { supabase, admin, userId } = await assertUser();
    if (!(await isStaff(supabase))) {
        return { ok: false, message: "초대할 권한이 없습니다." };
    }

    // 내가 그 방 멤버인지 서버에서 직접 검사한다.
    // admin 은 RLS 를 우회하므로 정책이 대신 막아주지 않는다
    const { data: me } = await admin
        .from("chat_room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();
    if (!me) return { ok: false, message: "참여 중인 방이 아닙니다." };

    const { data: room } = await admin
        .from("chat_rooms").select("kind").eq("id", roomId).maybeSingle();
    if (room?.kind !== "channel") {
        return { ok: false, message: "1:1 대화에는 사람을 추가할 수 없습니다." };
    }

    const { error } = await admin
        .from("chat_room_members")
        .upsert(
            memberIds.map((id) => ({ room_id: roomId, user_id: id })),
            { onConflict: "room_id,user_id", ignoreDuplicates: true },
        );
    if (error) throw new Error(`초대 실패: ${error.message}`);

    return { ok: true };
}

/** 메시지 전송. */
// export async function sendChatMessage(roomId: string, body: string) {
//     const { supabase, admin, userId } = await assertUser();
//
//     const text = body.trim();
//     if (!text) throw new Error("내용을 입력해주세요.");
//
//     await reviveRoomIfNeeded(admin, roomId, userId);
//
//     // author_name 을 박아둔다. 실시간 payload 는 조인이 안 되므로
//     // 이름이 없으면 말풍선이 이름 없이 뜬다 (v5 문서 6-1)
//     const people = await loadPeople(admin, [userId]);
//     const myName = people.get(userId)?.name ?? "(이름 없음)";
//
//     // RLS 로 넣는다. chat_messages_insert 가 멤버십과 author_id 를 검사하므로
//     // 서버에서 같은 검사를 두 번 하지 않아도 된다
//     const { error } = await supabase.from("chat_messages").insert({
//         room_id: roomId,
//         author_id: userId,
//         author_name: myName,
//         body: text,
//     });
//     if (error) throw new Error(`전송 실패: ${error.message}`);
//
//     await supabase
//         .from("chat_room_members")
//         .update({ last_read_at: new Date().toISOString() })
//         .eq("room_id", roomId)
//         .eq("user_id", userId);
// }

export type SendResult =
    | { ok: true }
    | { ok: false; message: string };

export async function sendChatMessage(
    roomId: string,
    body: string,
    attachments?: ChatAttachment[],
): Promise<SendResult> {
    const { supabase, admin, userId } = await assertUser();

    const text = body.trim();
    const files = (attachments ?? []).slice(0, MAX_ATTACHMENTS);

    // 글도 파일도 없으면 보낼 게 없다. CHECK 제약과 같은 조건
    if (!text && files.length === 0) {
        return { ok: false, message: "내용을 입력해주세요." };
    }

    await reviveRoomIfNeeded(admin, roomId, userId);

    const people = await loadPeople(admin, [userId]);
    const myName = people.get(userId)?.name ?? "(이름 없음)";

    const { error } = await supabase.from("chat_messages").insert({
        room_id: roomId,
        author_id: userId,
        author_name: myName,
        body: text || null,
        attachments: files.length > 0 ? files : null,
    });
    if (error) throw new Error(`전송 실패: ${error.message}`);

    await supabase
        .from("chat_room_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId);

    return { ok: true };
}
/** 읽음 처리만. 패널에서 방을 볼 때 부른다. */
export async function markRoomRead(roomId: string) {
    const { supabase, userId } = await assertUser();
    await supabase
        .from("chat_room_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId);
}

export type CreateChannelResult =
    | { ok: true; roomId: string }
    | { ok: false; message: string };

export type InviteResult =
    | { ok: true }
    | { ok: false; message: string };
// ─────────────────────────────────────────────────────────────
// 방 나가기
// ─────────────────────────────────────────────────────────────

export type LeaveRoomResult =
    | { ok: true }
    | { ok: false; message: string };

/**
 * 방에서 나간다. 내 멤버십 행만 지운다.
 *
 * is_room_member() 가 false 가 되면 RLS 가 방·메시지·멤버를 전부 가린다.
 * 남은 사람에게는 아무 일도 일어나지 않는다 — 대화도 목록도 그대로다.
 *
 * ★ 메시지는 지우지 않는다. 내가 나갔다고 남의 대화에서 내 말이
 *   사라지면 안 된다. author_name 을 박아둔 것도 같은 이유다 (6-1).
 *
 * chat_room_members 에 DELETE 정책이 없으므로(4-8) admin 으로 간다.
 * admin 은 RLS 를 우회하니 "내 행만" 을 서버가 직접 검사해야 한다.
 */
export async function leaveRoom(roomId: string): Promise<LeaveRoomResult> {
    const { admin, userId } = await assertUser();

    const { data: me } = await admin
        .from("chat_room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();
    if (!me) {
        return { ok: false, message: "참여 중인 방이 아닙니다." };
    }

    // .eq("user_id", userId) 가 없으면 방 전체가 날아간다. 반드시 둘 다.
    const { error } = await admin
        .from("chat_room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId);
    if (error) throw new Error(`나가기 실패: ${error.message}`);

    // 아무도 안 남으면 방을 접는다. 안 그러면 dm_key 만 잡아먹는
    // 빈 방이 영원히 쌓인다. archived_at 이라 메시지는 남는다
    const { count } = await admin
        .from("chat_room_members")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", roomId);

    if ((count ?? 0) === 0) {
        await admin
            .from("chat_rooms")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", roomId);
    }

    return { ok: true };
}
