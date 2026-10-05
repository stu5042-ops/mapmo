type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type D1Database = { prepare: (query: string) => D1PreparedStatement };
type R2Object = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string | null };
};
type R2Bucket = {
  get: (key: string) => Promise<R2Object | null>;
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
};

export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

const COOKIE = "mm_session";
const SESSION_DAYS = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const tables = new Set([
  "profiles",
  "memos",
  "memo_likes",
  "memo_comments",
  "friendships",
  "messages",
]);

const columns: Record<string, Set<string>> = {
  profiles: new Set(["id", "nickname", "avatar_url", "birth_year", "created_at"]),
  memos: new Set([
    "id",
    "user_id",
    "title",
    "content",
    "lat",
    "lng",
    "place_name",
    "image_url",
    "track_id",
    "track_title",
    "track_artist",
    "track_cover",
    "track_link",
    "created_at",
  ]),
  memo_likes: new Set(["memo_id", "user_id", "created_at"]),
  memo_comments: new Set(["id", "memo_id", "user_id", "content", "created_at"]),
  friendships: new Set(["id", "requester", "addressee", "status", "created_at"]),
  messages: new Set([
    "id",
    "sender",
    "receiver",
    "content",
    "image_url",
    "track_id",
    "track_title",
    "track_artist",
    "track_cover",
    "lat",
    "lng",
    "place_name",
    "read_at",
    "created_at",
  ]),
};

const insertColumns: Record<string, Set<string>> = {
  memos: new Set([
    "title",
    "content",
    "lat",
    "lng",
    "place_name",
    "image_url",
    "track_id",
    "track_title",
    "track_artist",
    "track_cover",
    "track_link",
  ]),
  memo_likes: new Set(["memo_id"]),
  memo_comments: new Set(["memo_id", "content"]),
  friendships: new Set(["addressee"]),
  messages: new Set([
    "receiver",
    "content",
    "image_url",
    "track_id",
    "track_title",
    "track_artist",
    "track_cover",
    "lat",
    "lng",
    "place_name",
  ]),
};

const updateColumns: Record<string, Set<string>> = {
  profiles: new Set(["nickname", "avatar_url", "birth_year"]),
  memos: new Set([
    "title",
    "content",
    "lat",
    "lng",
    "place_name",
    "image_url",
    "track_id",
    "track_title",
    "track_artist",
    "track_cover",
    "track_link",
  ]),
  friendships: new Set(["status"]),
  messages: new Set(["read_at"]),
};

const deleteAllowed = new Set(["memos", "memo_likes", "memo_comments", "friendships"]);

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("Cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  for (const raw of cookies) {
    const cookie = raw.trim();
    if (cookie.startsWith(prefix)) return cookie.slice(prefix.length);
  }
  return undefined;
}

async function sha(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(bytes));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return hex(value);
}

function uuid() {
  return crypto.randomUUID();
}

async function passwordHash(password: string) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = hex(saltBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${salt}:${hex(new Uint8Array(bits))}`;
}

async function passwordCheck(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(expected)) {
    return false;
  }

  const saltBytes = Uint8Array.from(salt.match(/.{2}/g)!, (value) => parseInt(value, 16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  const actual = hex(new Uint8Array(bits));
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.max(actual.length, expected.length); i += 1) {
    diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function sessionUser(request: Request, env: Env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const tokenHash = await sha(token);
  return env.DB.prepare(
    `SELECT u.id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{ id: string; email: string }>();
}

function sessionCookie(token: string, maxAge: number, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

function originOk(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function assertTable(table: unknown): asserts table is string {
  if (typeof table !== "string" || !tables.has(table)) {
    throw new Error("지원하지 않는 테이블입니다.");
  }
}

function assertKnownColumns(table: string, values: Record<string, unknown>, allowed: Record<string, Set<string>>) {
  const columnSet = allowed[table];
  if (!columnSet) throw new Error("지원하지 않는 작업입니다.");
  for (const key of Object.keys(values)) {
    if (!columnSet.has(key)) throw new Error("허용되지 않은 필드입니다.");
  }
}

function assertStringLength(value: unknown, max: number, message: string) {
  if (typeof value !== "string" || value.length > max) throw new Error(message);
}

function assertNumber(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(message);
  }
}

function assertMediaPath(value: unknown, userId: string) {
  if (value == null) return;
  if (
    typeof value !== "string" ||
    !value.startsWith(`/media/${userId}/`) ||
    value.length > 500
  ) {
    throw new Error("잘못된 이미지 경로입니다.");
  }
}

function validateMemoValues(values: Record<string, unknown>, userId: string, requireLocation = false) {
  if (values.title !== undefined) assertStringLength(values.title, 200, "제목이 너무 깁니다.");
  if (values.content !== undefined) assertStringLength(values.content, 10_000, "내용이 너무 깁니다.");
  if (requireLocation) {
    assertNumber(values.lat, -90, 90, "잘못된 위도입니다.");
    assertNumber(values.lng, -180, 180, "잘못된 경도입니다.");
  } else {
    if (values.lat !== undefined) assertNumber(values.lat, -90, 90, "잘못된 위도입니다.");
    if (values.lng !== undefined) assertNumber(values.lng, -180, 180, "잘못된 경도입니다.");
  }
  if (values.place_name != null) assertStringLength(values.place_name, 300, "장소 이름이 너무 깁니다.");
  if (values.image_url !== undefined) assertMediaPath(values.image_url, userId);
  if (values.track_id != null) assertNumber(values.track_id, 1, 2_147_483_647, "잘못된 음악 정보입니다.");
  for (const field of ["track_title", "track_artist", "track_cover", "track_link"] as const) {
    if (values[field] != null) assertStringLength(values[field], 500, "음악 정보가 너무 깁니다.");
  }
}

function validateMessageValues(values: Record<string, unknown>, userId: string) {
  if (typeof values.receiver !== "string" || values.receiver === userId) throw new Error("받는 사용자가 올바르지 않습니다.");
  assertStringLength(values.content, 4_000, "메시지가 너무 깁니다.");
  assertMediaPath(values.image_url, userId);
  if (values.track_id != null) assertNumber(values.track_id, 1, 2_147_483_647, "잘못된 음악 정보입니다.");
  for (const field of ["track_title", "track_artist", "track_cover"] as const) {
    if (values[field] != null) assertStringLength(values[field], 500, "음악 정보가 너무 깁니다.");
  }
  if (values.place_name != null) assertStringLength(values.place_name, 300, "장소 이름이 너무 깁니다.");
  if (values.lat != null) assertNumber(values.lat, -90, 90, "잘못된 위도입니다.");
  if (values.lng != null) assertNumber(values.lng, -180, 180, "잘못된 경도입니다.");
}

function validateCommentValues(values: Record<string, unknown>) {
  if (typeof values.memo_id !== "string" || !values.memo_id) throw new Error("메모가 올바르지 않습니다.");
  if (typeof values.content !== "string") throw new Error("댓글을 입력해주세요.");
  assertStringLength(values.content, 2_000, "댓글이 너무 깁니다.");
  if (!values.content.trim()) throw new Error("댓글을 입력해주세요.");
}

function buildWhere(
  filters: Array<{ op: string; column: string; value: unknown }>,
  table: string,
) {
  const where: string[] = [];
  const args: unknown[] = [];

  for (const filter of filters) {
    if (!columns[table]?.has(filter.column) || !["eq", "is"].includes(filter.op)) {
      throw new Error("허용되지 않은 필터입니다.");
    }
    if (filter.op === "eq") {
      where.push(`${filter.column} = ?`);
      args.push(filter.value);
    } else {
      where.push(`${filter.column} IS NULL`);
    }
  }

  return { where, args };
}

async function selectRows(
  request: Request,
  env: Env,
  body: {
    table: string;
    filters?: Array<{ op: string; column: string; value: unknown }>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
  },
  user: { id: string; email: string } | null,
) {
  const table = body.table;
  if ((table === "friendships" || table === "messages") && !user) {
    return json({ data: null, error: { message: "로그인이 필요합니다." } }, 401);
  }

  const filters = body.filters ?? [];
  const { where, args } = buildWhere(filters, table);

  if (table === "friendships") {
    where.push("(requester = ? OR addressee = ?)");
    args.push(user!.id, user!.id);
  }
  if (table === "messages") {
    where.push("(sender = ? OR receiver = ?)");
    args.push(user!.id, user!.id);
  }

  let sql = `SELECT * FROM ${table}`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;

  if (body.order) {
    if (!columns[table].has(body.order.column)) throw new Error("허용되지 않은 정렬입니다.");
    sql += ` ORDER BY ${body.order.column} ${body.order.ascending === false ? "DESC" : "ASC"}`;
  }

  const limit = body.limit == null ? undefined : Math.min(Math.max(Math.trunc(body.limit), 1), 2_000);
  if (limit != null) sql += ` LIMIT ${limit}`;

  const result = await env.DB.prepare(sql).bind(...args).all();
  let rows = result.results as Record<string, any>[];

  if (table === "memos" && rows.length) {
    const ids = rows.map((row) => row.id as string);
    const placeholders = ids.map(() => "?").join(",");
    const [profileResult, likeResult, commentResult] = await Promise.all([
      env.DB
        .prepare(
          `SELECT id, nickname, avatar_url
           FROM profiles
           WHERE id IN (SELECT user_id FROM memos WHERE id IN (${placeholders}))`,
        )
        .bind(...ids)
        .all(),
      env.DB
        .prepare(`SELECT memo_id, user_id FROM memo_likes WHERE memo_id IN (${placeholders})`)
        .bind(...ids)
        .all(),
      env.DB
        .prepare(`SELECT memo_id, COUNT(*) AS count FROM memo_comments WHERE memo_id IN (${placeholders}) GROUP BY memo_id`)
        .bind(...ids)
        .all(),
    ]);

    const profiles = new Map<string, any>(
      (profileResult.results as any[]).map((profile) => [profile.id, profile]),
    );
    const likes = new Map<string, { user_id: string }[]>();
    const commentCounts = new Map<string, number>();

    for (const like of likeResult.results as any[]) {
      const list = likes.get(like.memo_id) ?? [];
      list.push({ user_id: like.user_id });
      likes.set(like.memo_id, list);
    }
    for (const comment of commentResult.results as any[]) {
      commentCounts.set(comment.memo_id, Number(comment.count));
    }

    rows = rows.map((row) => ({
      ...row,
      profiles: profiles.get(row.user_id) ?? null,
      memo_likes: likes.get(row.id) ?? [],
      memo_comments: [{ count: commentCounts.get(row.id) ?? 0 }],
    }));
  }

  if (table === "memo_comments" && rows.length) {
    const userIds = [...new Set(rows.map((row) => row.user_id as string))];
    const placeholders = userIds.map(() => "?").join(",");
    const { results } = await env.DB
      .prepare(`SELECT id, nickname, avatar_url FROM profiles WHERE id IN (${placeholders})`)
      .bind(...userIds)
      .all();
    const profiles = new Map<string, any>((results as any[]).map((profile) => [profile.id, profile]));
    rows = rows.map((row) => ({ ...row, profiles: profiles.get(row.user_id) ?? null }));
  }

  return json({ data: rows, error: null });
}

async function db(request: Request, env: Env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!originOk(request)) return json({ data: null, error: { message: "잘못된 요청 출처입니다." } }, 403);

  const body = (await request.json()) as {
    table: string;
    action: "select" | "insert" | "update" | "delete";
    select?: string;
    filters?: Array<{ op: string; column: string; value: unknown }>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    values?: unknown;
  };

  assertTable(body.table);
  if (!["select", "insert", "update", "delete"].includes(body.action)) {
    throw new Error("지원하지 않는 작업입니다.");
  }

  const user = await sessionUser(request, env);

  if (body.action === "select") {
    return selectRows(request, env, body, user);
  }

  if (!user) return json({ data: null, error: { message: "로그인이 필요합니다." } }, 401);

  const table = body.table;
  const values = (body.values ?? {}) as Record<string, unknown>;
  const filters = body.filters ?? [];
  buildWhere(filters, table);

  if (body.action === "insert") {
    const allowed = insertColumns[table];
    if (!allowed) throw new Error("지원하지 않는 추가 작업입니다.");
    assertKnownColumns(table, values, insertColumns);

    if (table === "memos") validateMemoValues(values, user.id, true);
    if (table === "memo_comments") validateCommentValues(values);
    if (table === "messages") validateMessageValues(values, user.id);

    if (table === "friendships") {
      if (typeof values.addressee !== "string" || values.addressee === user.id) throw new Error("친구 대상이 올바르지 않습니다.");
    }
    if (table === "memo_likes") {
      if (typeof values.memo_id !== "string" || !values.memo_id) throw new Error("메모가 올바르지 않습니다.");
      const memo = await env.DB.prepare("SELECT id FROM memos WHERE id = ?").bind(values.memo_id).first();
      if (!memo) throw new Error("존재하지 않는 메모입니다.");
    }

    const data: Record<string, unknown> = {
      ...values,
      ...(table === "memos" ? { id: uuid(), user_id: user.id } : {}),
      ...(table === "memo_likes" ? { user_id: user.id } : {}),
      ...(table === "memo_comments" ? { id: uuid(), user_id: user.id } : {}),
      ...(table === "friendships" ? { id: uuid(), requester: user.id, status: "pending" } : {}),
      ...(table === "messages" ? { id: uuid(), sender: user.id } : {}),
      created_at: new Date().toISOString(),
    };

    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(",");
    await env.DB
      .prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`)
      .bind(...keys.map((key) => data[key]))
      .run();

    return json({ data: null, error: null });
  }

  if (body.action === "update") {
    const allowed = updateColumns[table];
    if (!allowed) throw new Error("지원하지 않는 수정 작업입니다.");
    if (Object.keys(values).length === 0) throw new Error("수정할 내용이 없습니다.");
    assertKnownColumns(table, values, updateColumns);

    if (table === "profiles") {
      if (values.nickname != null) assertStringLength(values.nickname, 40, "닉네임이 너무 깁니다.");
      if (values.avatar_url != null) assertMediaPath(values.avatar_url, user.id);
      if (values.birth_year != null) assertNumber(values.birth_year, 1901, new Date().getFullYear(), "출생연도가 올바르지 않습니다.");
    }
    if (table === "memos") validateMemoValues(values, user.id);
    if (table === "friendships" && values.status !== "accepted") throw new Error("허용되지 않은 친구 상태입니다.");
    if (table === "messages" && values.read_at != null) assertStringLength(values.read_at, 50, "읽음 표시가 올바르지 않습니다.");

    const whereData = buildWhere(filters, table);
    const where = [...whereData.where];
    const args = [...whereData.args];

    if (table === "profiles") {
      where.push("id = ?");
      args.push(user.id);
    } else if (table === "memos") {
      where.push("user_id = ?");
      args.push(user.id);
    } else if (table === "friendships") {
      where.push("addressee = ?");
      args.push(user.id);
    } else if (table === "messages") {
      where.push("receiver = ?");
      args.push(user.id);
      if (!Object.keys(values).every((key) => key === "read_at")) throw new Error("허용되지 않은 메시지 수정입니다.");
    }

    if (!where.length) throw new Error("수정 대상이 없습니다.");

    const setKeys = Object.keys(values);
    const setSql = setKeys.map((key) => `${key} = ?`).join(",");
    const setArgs = setKeys.map((key) => values[key]);
    await env.DB
      .prepare(`UPDATE ${table} SET ${setSql} WHERE ${where.join(" AND ")}`)
      .bind(...setArgs, ...args)
      .run();

    return json({ data: null, error: null });
  }

  if (!deleteAllowed.has(table)) throw new Error("지원하지 않는 삭제 작업입니다.");

  const whereData = buildWhere(filters, table);
  const where = [...whereData.where];
  const args = [...whereData.args];

  if (table === "memos") {
    where.push("user_id = ?");
    args.push(user.id);
  } else if (table === "memo_likes") {
    where.push("user_id = ?");
    args.push(user.id);
  } else if (table === "memo_comments") {
    where.push("user_id = ?");
    args.push(user.id);
  } else if (table === "friendships") {
    where.push("(requester = ? OR addressee = ?)");
    args.push(user.id, user.id);
  }

  if (!where.length) throw new Error("삭제 대상이 없습니다.");
  await env.DB.prepare(`DELETE FROM ${table} WHERE ${where.join(" AND ")}`).bind(...args).run();
  return json({ data: null, error: null });
}

async function authApi(request: Request, env: Env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!originOk(request)) return json({ error: { message: "잘못된 요청 출처입니다." } }, 403);

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action;

  if (action === "session") {
    const user = await sessionUser(request, env);
    return json({
      data: { session: user ? { user: { id: user.id, email: user.email } } : null },
      error: null,
    });
  }

  if (action === "sign-out") {
    const token = getCookie(request, COOKIE);
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(token)).run();
    }
    return json(
      { data: { session: null }, error: null },
      200,
      { "set-cookie": sessionCookie("", 0, request) },
    );
  }

  if (action !== "sign-up" && action !== "sign-in") {
    return json({ error: { message: "지원하지 않는 인증 요청입니다." } }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (
    email.length > 254 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    password.length < 6 ||
    password.length > 128
  ) {
    return json({ error: { message: "이메일과 6~128자의 비밀번호를 입력해주세요." } }, 400);
  }

  let user = await env.DB
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; password_hash?: string }>();

  if (action === "sign-up") {
    if (user) return json({ error: { message: "이미 가입된 이메일입니다." } }, 409);

    const id = uuid();
    let nickname = String(body.nickname ?? "").trim();
    if (!nickname) nickname = email.split("@")[0] ?? "익명";
    nickname = nickname.slice(0, 40);

    await env.DB
      .prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
      .bind(id, email, await passwordHash(password))
      .run();
    await env.DB
      .prepare("INSERT INTO profiles (id, nickname) VALUES (?, ?)")
      .bind(id, nickname)
      .run();
    user = { id, email };
  } else if (!user?.password_hash || !(await passwordCheck(password, user.password_hash))) {
    return json({ error: { message: "이메일 또는 비밀번호가 올바르지 않아요." } }, 401);
  }

  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?")
    .bind(user.id, new Date().toISOString())
    .run();

  const token = randomToken();
  const tokenHash = await sha(token);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  await env.DB
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(uuid(), user.id, tokenHash, expiresAt)
    .run();

  return json(
    { data: { session: { user: { id: user.id, email: user.email } } }, error: null },
    200,
    { "set-cookie": sessionCookie(token, maxAge, request) },
  );
}

async function mediaApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const key = url.pathname.slice("/media/".length);
  if (!key) return new Response("Not found", { status: 404 });

  if (request.method === "GET" || request.method === "HEAD") {
    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    });
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(object.body, { headers });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function uploadMedia(request: Request, env: Env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!originOk(request)) return json({ error: "잘못된 요청 출처입니다." }, 403);

  const user = await sessionUser(request, env);
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  const formData = await request.formData();
  const file = formData.get("file");
  const requested = String(formData.get("path") ?? "");

  if (!(file instanceof File)) return json({ error: "사진 파일이 필요합니다." }, 400);
  if (!requested.startsWith(`${user.id}/`) || requested.includes("..") || requested.includes("\\")) {
    return json({ error: "잘못된 파일 경로입니다." }, 400);
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return json({ error: "사진은 8MB 이하만 업로드할 수 있어요." }, 413);
  }
  if (!IMAGE_TYPES.has(file.type)) {
    return json({ error: "JPG, PNG, GIF, WEBP 이미지만 업로드할 수 있어요." }, 400);
  }

  await env.MEDIA.put(requested, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ ok: true });
}

export async function handleApi(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) return mediaApi(request, env);
    if (url.pathname === "/api/auth") return authApi(request, env);
    if (url.pathname === "/api/media") return uploadMedia(request, env);
    if (url.pathname === "/api/db") return db(request, env);
    return null;
  } catch (error) {
    console.error(error);
    return json(
      { data: null, error: { message: error instanceof Error ? error.message : "서버 오류" } },
      400,
    );
  }
}
