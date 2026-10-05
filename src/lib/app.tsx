import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Pause, Play, X } from "lucide-react";

// ---------- Cloudflare API client ----------
type DbResponse<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

type Filter = { op: "eq" | "is"; column: string; value: unknown };
type QueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  select?: string;
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  values?: unknown;
};

class QueryBuilder<T = unknown> implements PromiseLike<DbResponse<T>> {
  private readonly state: QueryState;

  constructor(table: string, action: QueryState["action"] = "select", values?: unknown) {
    this.state = { table, action, filters: [], ...(values !== undefined ? { values } : {}) };
  }

  select(columns = "*") {
    this.state.select = columns;
    return this as unknown as QueryBuilder<T[]>;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.order = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.state.limit = count;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: null) {
    this.state.filters.push({ op: "is", column, value });
    return this;
  }

  then<TResult1 = DbResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResponse<T>> {
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(this.state),
      });
      const json = (await response.json()) as DbResponse<T>;
      if (!response.ok && !json.error) return { data: null, error: { message: `요청 실패 (${response.status})` } };
      return json;
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "네트워크 오류" } };
    }
  }
}

function builder(table: string, action: QueryState["action"], values?: unknown) {
  return new QueryBuilder(table, action, values);
}

export type User = { id: string; email?: string | null; created_at?: string };
type Session = { user: User };
const authListeners = new Set<(event: string, session: Session | null) => void>();
let cachedSession: Session | null | undefined;

async function authRequest(body: unknown) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return response.json() as Promise<{
    data?: { user?: User; session?: Session | null };
    error?: { message: string };
  }>;
}

const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await authRequest({ action: "sign-in", email, password });
    const session = result.data?.session ?? null;
    cachedSession = session;
    authListeners.forEach((listener) => listener("SIGNED_IN", session));
    return { data: { user: session?.user ?? null, session }, error: result.error ? new Error(result.error.message) : null };
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { nickname?: string } } }) {
    const result = await authRequest({ action: "sign-up", email, password, nickname: options?.data?.nickname });
    const session = result.data?.session ?? null;
    cachedSession = session;
    authListeners.forEach((listener) => listener("SIGNED_IN", session));
    return { data: { user: session?.user ?? null, session }, error: result.error ? new Error(result.error.message) : null };
  },

  async signOut() {
    await authRequest({ action: "sign-out" });
    cachedSession = null;
    authListeners.forEach((listener) => listener("SIGNED_OUT", null));
    return { error: null };
  },

  async getSession() {
    if (cachedSession !== undefined) return { data: { session: cachedSession }, error: null };
    const result = await authRequest({ action: "session" });
    cachedSession = result.data?.session ?? null;
    return { data: { session: cachedSession }, error: null };
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    authListeners.add(callback);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
  },
};

export const api = {
  from(table: string) {
    return {
      select: <T = unknown>(columns = "*") => new QueryBuilder<T>(table, "select").select(columns),
      insert: (values: unknown) => builder(table, "insert", values),
      update: (values: unknown) => builder(table, "update", values),
      delete: () => builder(table, "delete"),
    };
  },
  auth,
  storage: {
    from(bucket: string) {
      if (bucket !== "media") throw new Error("지원하지 않는 저장소입니다.");
      return {
        async upload(path: string, file: File) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", path);
          const response = await fetch("/api/media", { method: "POST", body: formData, credentials: "include" });
          const json = (await response.json()) as { error?: string };
          return { error: json.error ? new Error(json.error) : null };
        },
      };
    },
  },
};

// ---------- Memo / social data helpers ----------
export type Memo = {
  id: string; user_id: string; title: string; content: string; lat: number; lng: number;
  place_name: string | null; image_url: string | null; track_id: number | null; track_title: string | null;
  track_artist: string | null; track_cover: string | null; track_link: string | null; created_at: string;
  profiles: { nickname: string; avatar_url: string | null } | null;
  memo_likes: { user_id: string }[]; memo_comments: { count: number }[];
};
const SELECT_MEMOS = "*, profiles(nickname, avatar_url), memo_likes(user_id), memo_comments(count)";

export async function fetchAllMemos(): Promise<Memo[]> {
  const { data, error } = await api.from("memos").select<Memo>(SELECT_MEMOS).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type Place = { name: string; full: string; lat: number; lng: number };
export async function searchPlaces(q: string): Promise<Place[]> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=ko&q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{ display_name: string; name?: string; lat: string; lon: string }>;
  return json.map((r) => ({ name: r.name || r.display_name.split(",")[0] || r.display_name, full: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ko&lat=${lat}&lon=${lng}`);
    if (!res.ok) return "현재 위치";
    const j = (await res.json()) as { name?: string; display_name?: string };
    return j.name || j.display_name?.split(",").slice(0, 2).join(",") || "현재 위치";
  } catch {
    return "현재 위치";
  }
}

export function memosNear(memos: Memo[], lat: number, lng: number, km = 0.3) {
  const d = km / 111;
  return memos.filter((m) => Math.abs(m.lat - lat) < d && Math.abs(m.lng - lng) < d * 1.3);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export type UserLite = { id: string; nickname: string; avatar_url: string | null; birth_year: number | null };
export type Friendship = { id: string; requester: string; addressee: string; status: string };
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
export function chosung(s: string) {
  return [...s].map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : c;
  }).join("");
}
export const isChosungOnly = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);
export function matchUser(u: UserLite, q: string, age: string) {
  if (age) {
    if (!u.birth_year) return false;
    const a = new Date().getFullYear() - u.birth_year + 1;
    const decade = Math.floor(a / 10) * 10;
    if (age === "50" ? decade < 50 : String(decade) !== age) return false;
  }
  if (!q) return true;
  const n = u.nickname.toLowerCase();
  return isChosungOnly(q) ? chosung(n).includes(q) : n.includes(q.toLowerCase());
}
export async function fetchUsers() {
  const { data, error } = await api.from("profiles").select<UserLite>("id, nickname, avatar_url, birth_year").order("nickname").limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function fetchFriendships() {
  const { data, error } = await api.from("friendships").select<Friendship>("id, requester, addressee, status");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export function relation(fs: Friendship[], me: string, other: string) {
  const f = fs.find((x) => (x.requester === me && x.addressee === other) || (x.requester === other && x.addressee === me));
  if (!f) return { kind: "none" as const };
  if (f.status === "accepted") return { kind: "friend" as const, f };
  return f.requester === me ? { kind: "sent" as const, f } : { kind: "received" as const, f };
}

// ---------- Auth ----------
export type Profile = { id: string; nickname: string; avatar_url: string | null; birth_year: number | null };
type AuthContext = { user: User | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void> };
const AuthCtx = createContext<AuthContext>({ user: null, profile: null, loading: true, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string | undefined) {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await api.from("profiles").select<Profile>("id, nickname, avatar_url, birth_year").eq("id", uid);
    setProfile(Array.isArray(data) ? (data[0] ?? null) : null);
  }

  useEffect(() => {
    const { data: sub } = api.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      void loadProfile(next?.id);
    });
    void api.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      return loadProfile(data.session?.user?.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthCtx.Provider value={{ user, profile, loading, refreshProfile: () => loadProfile(user?.id) }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

export async function uploadMedia(userId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await api.storage.from("media").upload(path, file);
  if (error) throw error;
  return `/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// ---------- Deezer preview / player ----------
export type Track = { id: number; title: string; artist: string; cover: string; link: string };

export const searchDeezer = createServerFn({ method: "GET" })
  .inputValidator((value) => {
    const q = typeof (value as { q?: unknown })?.q === "string" ? (value as { q: string }).q.trim() : "";
    if (!q || q.length > 100) throw new Error("검색어가 올바르지 않아요");
    return { q };
  })
  .handler(async ({ data }): Promise<{ tracks: Track[]; error?: string }> => {
    try {
      const res = await fetch(`https://api.deezer.com/search?limit=8&q=${encodeURIComponent(data.q)}`);
      if (!res.ok) return { tracks: [], error: "검색 실패" };
      const json = (await res.json()) as { data?: Array<{ id: number; title: string; link: string; artist: { name: string }; album: { cover_small: string } }> };
      return { tracks: (json.data ?? []).map((t) => ({ id: t.id, title: t.title, artist: t.artist.name, cover: t.album.cover_small, link: t.link })) };
    } catch (error) {
      console.error(error);
      return { tracks: [], error: "검색 실패" };
    }
  });

export const getTrackPreview = createServerFn({ method: "GET" })
  .inputValidator((value) => {
    const id = (value as { id?: unknown })?.id;
    if (typeof id !== "number" || !Number.isInteger(id)) throw new Error("곡 ID가 올바르지 않아요");
    return { id };
  })
  .handler(async ({ data }): Promise<{ preview: string | null }> => {
    try {
      const res = await fetch(`https://api.deezer.com/track/${data.id}`);
      if (!res.ok) return { preview: null };
      const json = (await res.json()) as { preview?: string };
      return { preview: json.preview || null };
    } catch {
      return { preview: null };
    }
  });

type PlayTrack = { id: number; title: string; artist: string; cover: string | null };
type PlayerContext = { current: PlayTrack | null; playing: boolean; play: (track: PlayTrack) => void };
const PlayerCtx = createContext<PlayerContext>({ current: null, playing: false, play: () => {} });

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PlayTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const fetchPreview = useServerFn(getTrackPreview);

  useEffect(() => {
    const element = new Audio();
    element.onplay = () => setPlaying(true);
    element.onpause = () => setPlaying(false);
    element.onended = () => setPlaying(false);
    audio.current = element;
    return () => element.pause();
  }, []);

  async function play(track: PlayTrack) {
    const element = audio.current;
    if (!element) return;
    if (current?.id === track.id && element.src) {
      if (element.paused) void element.play();
      else element.pause();
      return;
    }
    setError("");
    setCurrent(track);
    element.pause();
    const { preview } = await fetchPreview({ data: { id: track.id } });
    if (!preview) {
      setError("재생할 수 없는 곡이에요");
      return;
    }
    element.src = preview;
    void element.play().catch(() => setError("재생 실패"));
  }

  return (
    <PlayerCtx.Provider value={{ current, playing, play }}>
      {children}
      {current && (
        <div className="fixed bottom-6 left-1/2 z-[2000] flex w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 border border-foreground bg-primary p-2 shadow-sm">
          {current.cover && <img src={current.cover} alt="" className="h-10 w-10 border border-border" />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-semibold">{current.title}</div>
            <div className="truncate text-xs">{error || `${current.artist} · 30초 미리듣기`}</div>
          </div>
          <button onClick={() => void play(current)} className="bg-background p-2" aria-label="재생/정지">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => { audio.current?.pause(); setCurrent(null); }} className="p-2" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </PlayerCtx.Provider>
  );
}

export const usePlayer = () => useContext(PlayerCtx);
