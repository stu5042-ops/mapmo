import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, MapPin, MessageCircle, Music, Pencil, Send, Trash2, X } from "lucide-react";
import { api, fetchFriendships, fetchUsers, matchUser, relation, reverseGeocode, timeAgo, uploadMedia, useAuth, type Memo, type Track, type UserLite } from "@/lib/app";
import { Avatar, TrackChip, TrackPicker } from "./common";

type Tab = "feed" | "friends" | "requests" | "search";
type Props = { memos: Memo[]; onClose: () => void; onOpenMemo: (m: Memo) => void; onMessage: (u: UserLite) => void };

export function FriendsPanel({ memos, onClose, onOpenMemo, onMessage }: Props) {
  const { user } = useAuth();
  const me = user!.id;
  const [tab, setTab] = useState<Tab>("feed");
  const [q, setQ] = useState("");
  const [age, setAge] = useState("");
  const users = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const fs = useQuery({ queryKey: ["friendships"], queryFn: fetchFriendships });
  const all = users.data ?? [];
  const list = fs.data ?? [];

  const friends = all.filter((u) => relation(list, me, u.id).kind === "friend");
  const received = all.filter((u) => relation(list, me, u.id).kind === "received");
  const friendIds = new Set(friends.map((f) => f.id));
  const feed = memos.filter((m) => friendIds.has(m.user_id)).slice(0, 50);
  const results = useMemo(
    () => all.filter((u) => u.id !== me && matchUser(u, q.trim(), age)),
    [all, q, age, me],
  );

  async function act(u: UserLite) {
    const r = relation(list, me, u.id);
    if (r.kind === "none") await api.from("friendships").insert({ addressee: u.id });
    else if (r.kind === "received") await api.from("friendships").update({ status: "accepted" }).eq("id", r.f.id);
    else if (confirm(r.kind === "friend" ? "친구를 끊을까요?" : "요청을 취소할까요?"))
      await api.from("friendships").delete().eq("id", r.f.id);
    fs.refetch();
  }

  function Row({ u }: { u: UserLite }) {
    const r = relation(list, me, u.id).kind;
    const label = { none: "친구 요청", sent: "요청됨", received: "수락", friend: "친구" }[r];
    return (
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Avatar url={u.avatar_url} name={u.nickname} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{u.nickname}</div>
          {u.birth_year && <div className="text-xs text-muted-foreground">{new Date().getFullYear() - u.birth_year + 1}세</div>}
        </div>
        <button onClick={() => onMessage(u)} className="p-2 hover:bg-accent" aria-label="메시지"><MessageCircle className="h-4 w-4" /></button>
        <button onClick={() => act(u)} className={`border border-border px-2.5 py-1 text-xs ${r === "none" || r === "received" ? "bg-primary font-semibold" : "hover:bg-accent"}`}>{label}</button>
      </div>
    );
  }

  const tabs: [Tab, string][] = [["feed", "소식"], ["friends", `친구 ${friends.length}`], ["requests", `요청${received.length ? ` ${received.length}` : ""}`], ["search", "찾기"]];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="font-semibold">친구</div>
        <button onClick={onClose} className="p-2 hover:bg-accent" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-4 border-b border-border text-sm">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2 ${tab === k ? "bg-primary font-semibold" : "hover:bg-accent"}`}>{l}</button>
        ))}
      </div>
      {tab === "search" && (
        <div className="flex gap-2 border-b border-border p-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 또는 초성 (예: ㄱㅁㅅ)" className="min-w-0 flex-1 border border-border px-3 py-2 text-sm outline-none focus:border-butter-deep" />
          <select value={age} onChange={(e) => setAge(e.target.value)} className="border border-border bg-background px-2 text-sm">
            <option value="">전체 나이</option>
            <option value="10">10대</option>
            <option value="20">20대</option>
            <option value="30">30대</option>
            <option value="40">40대</option>
            <option value="50">50대+</option>
          </select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {tab === "feed" && (feed.length === 0
          ? <div className="p-6 text-center text-sm text-muted-foreground">친구의 새 메모가 여기에 올라와요</div>
          : feed.map((m) => (
            <button key={m.id} onClick={() => onOpenMemo(m)} className="flex w-full gap-3 border-b border-border p-3 text-left hover:bg-accent">
              <Avatar url={m.profiles?.avatar_url} name={m.profiles?.nickname} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground"><b className="text-foreground">{m.profiles?.nickname}</b> · {m.place_name} · {timeAgo(m.created_at)}</div>
                <div className="truncate text-sm font-semibold">{m.title}</div>
                {m.track_title && <div className="truncate text-xs">♪ {m.track_title}</div>}
              </div>
              {m.image_url && <img src={m.image_url} alt="" className="h-12 w-12 object-cover" />}
            </button>
          )))}
        {tab === "friends" && (friends.length ? friends.map((u) => <Row key={u.id} u={u} />) : <div className="p-6 text-center text-sm text-muted-foreground">찾기 탭에서 친구를 추가해보세요</div>)}
        {tab === "requests" && (received.length ? received.map((u) => <Row key={u.id} u={u} />) : <div className="p-6 text-center text-sm text-muted-foreground">받은 요청이 없어요</div>)}
        {tab === "search" && results.map((u) => <Row key={u.id} u={u} />)}
      </div>
    </div>
  );
}

type Msg = {
  id: string; sender: string; receiver: string; content: string; image_url: string | null;
  track_id: number | null; track_title: string | null; track_artist: string | null; track_cover: string | null;
  lat: number | null; lng: number | null; place_name: string | null; read_at: string | null; created_at: string;
};

type Props = { initial: UserLite | null; onClose: () => void; onFocus: (lat: number, lng: number) => void };

export function MessagesPanel({ initial, onClose, onFocus }: Props) {
  const { user } = useAuth();
  const me = user!.id;
  const [peer, setPeer] = useState<UserLite | null>(initial);
  const users = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const msgs = useQuery({
    queryKey: ["messages"],
    queryFn: async () => {
      const { data } = await api.from("messages").select("*").order("created_at").limit(2000);
      return (data ?? []) as Msg[];
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => void msgs.refetch(), 2000);
    return () => window.clearInterval(timer);
  }, [msgs.refetch]);

  const all = msgs.data ?? [];
  const byId = new Map((users.data ?? []).map((u) => [u.id, u]));

  if (peer) return <Chat peer={peer} me={me} msgs={all.filter((m) => (m.sender === me && m.receiver === peer.id) || (m.sender === peer.id && m.receiver === me))} onBack={() => setPeer(null)} onFocus={onFocus} refetch={() => msgs.refetch()} />;

  const convos = new Map<string, Msg>();
  all.forEach((m) => convos.set(m.sender === me ? m.receiver : m.sender, m));
  const sorted = [...convos.entries()].sort((a, b) => b[1].created_at.localeCompare(a[1].created_at));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="font-semibold">메시지</div>
        <button onClick={onClose} className="p-2 hover:bg-accent" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">친구 탭에서 누구에게나 메시지를 보낼 수 있어요</div>}
        {sorted.map(([uid, last]) => {
          const u = byId.get(uid);
          if (!u) return null;
          const unread = all.filter((m) => m.sender === uid && m.receiver === me && !m.read_at).length;
          return (
            <button key={uid} onClick={() => setPeer(u)} className="flex w-full items-center gap-3 border-b border-border p-3 text-left hover:bg-accent">
              <Avatar url={u.avatar_url} name={u.nickname} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-sm"><b>{u.nickname}</b><span className="text-xs text-muted-foreground">{timeAgo(last.created_at)}</span></div>
                <div className="truncate text-xs text-muted-foreground">{summary(last)}</div>
              </div>
              {unread > 0 && <span className="bg-foreground px-1.5 text-xs text-background">{unread}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function summary(m: Msg) {
  return m.content || (m.image_url ? "사진" : m.track_title ? `♪ ${m.track_title}` : m.place_name ? `📍 ${m.place_name}` : "");
}

function Chat({ peer, me, msgs, onBack, onFocus, refetch }: { peer: UserLite; me: string; msgs: Msg[]; onBack: () => void; onFocus: (lat: number, lng: number) => void; refetch: () => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [showTrack, setShowTrack] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView(); }, [msgs.length]);
  useEffect(() => {
    if (msgs.some((m) => m.receiver === me && !m.read_at))
      void api.from("messages").update({ read_at: new Date().toISOString() }).eq("sender", peer.id).eq("receiver", me).is("read_at", null);
  }, [msgs, me, peer.id]);

  function shareLocation() {
    navigator.geolocation?.getCurrentPosition(async (p) => {
      const { latitude: lat, longitude: lng } = p.coords;
      setLoc({ lat, lng, name: await reverseGeocode(lat, lng) });
    });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file && !track && !loc) return;
    setBusy(true);
    const image_url = file ? await uploadMedia(me, file) : null;
    await api.from("messages").insert({
      receiver: peer.id, content: text.trim(), image_url,
      track_id: track?.id ?? null, track_title: track?.title ?? null, track_artist: track?.artist ?? null, track_cover: track?.cover ?? null,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null, place_name: loc?.name ?? null,
    });
    setText(""); setFile(null); setTrack(null); setLoc(null); setShowTrack(false); setBusy(false);
    refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <button onClick={onBack} className="p-2 hover:bg-accent" aria-label="뒤로"><ArrowLeft className="h-4 w-4" /></button>
        <Avatar url={peer.avatar_url} name={peer.nickname} size={28} />
        <b className="text-sm">{peer.nickname}</b>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-secondary p-3">
        {msgs.map((m) => {
          const mine = m.sender === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] space-y-1.5 border border-border p-2 text-sm ${mine ? "bg-primary" : "bg-background"}`}>
                {m.image_url && <img src={m.image_url} alt="" className="max-h-48 w-full object-cover" />}
                {m.track_id && <TrackChip id={m.track_id} title={m.track_title} artist={m.track_artist} cover={m.track_cover} />}
                {m.lat != null && m.lng != null && (
                  <button onClick={() => onFocus(m.lat!, m.lng!)} className="flex items-center gap-1 border border-foreground bg-background px-2 py-1 text-xs"><MapPin className="h-3 w-3" />{m.place_name ?? "위치"}</button>
                )}
                {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                <div className="text-[10px] text-muted-foreground">{timeAgo(m.created_at)}{mine && m.read_at ? " · 읽음" : ""}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {(file || track || loc || showTrack) && (
        <div className="space-y-1 border-t border-border p-2 text-xs">
          {file && <div className="flex justify-between">사진: {file.name}<button onClick={() => setFile(null)}><X className="h-3 w-3" /></button></div>}
          {loc && <div className="flex justify-between">📍 {loc.name}<button onClick={() => setLoc(null)}><X className="h-3 w-3" /></button></div>}
          {showTrack && <TrackPicker value={track} onChange={setTrack} />}
        </div>
      )}
      <form onSubmit={send} className="flex items-center border-t border-border">
        <label className="cursor-pointer p-3 hover:bg-accent" aria-label="사진"><ImagePlus className="h-4 w-4" /><input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <button type="button" onClick={() => setShowTrack(!showTrack)} className="p-3 hover:bg-accent" aria-label="노래"><Music className="h-4 w-4" /></button>
        <button type="button" onClick={shareLocation} className="p-3 hover:bg-accent" aria-label="위치"><MapPin className="h-4 w-4" /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none" />
        <button disabled={busy} className="bg-primary p-3 disabled:opacity-50" aria-label="보내기"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}

type Props = { memos: Memo[]; onClose: () => void; onOpen: (m: Memo) => void; onEdit: (m: Memo) => void };

export function ProfilePanel({ memos, onClose, onOpen, onEdit }: Props) {
  const { user, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [birth, setBirth] = useState(profile?.birth_year ? String(profile.birth_year) : "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const mine = memos.filter((m) => m.user_id === user?.id);

  async function save() {
    if (!user) return;
    setBusy(true);
    const by = parseInt(birth, 10);
    await api.from("profiles").update({ nickname, birth_year: by > 1900 && by <= new Date().getFullYear() ? by : null }).eq("id", user.id);
    await refreshProfile();
    qc.invalidateQueries({ queryKey: ["memos"] });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function changeAvatar(f: File | undefined) {
    if (!user || !f) return;
    setBusy(true);
    const url = await uploadMedia(user.id, f);
    await api.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    await refreshProfile();
    setBusy(false);
  }

  async function remove(m: Memo) {
    if (!confirm(`"${m.title}" 메모를 삭제할까요?`)) return;
    await api.from("memos").delete().eq("id", m.id);
    qc.invalidateQueries({ queryKey: ["memos"] });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="font-semibold">내 프로필</div>
        <button onClick={onClose} className="p-2 hover:bg-accent" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-border p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <Avatar url={profile?.avatar_url} name={profile?.nickname} size={56} />
            <div>
              <div className="font-semibold">{profile?.nickname}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
              <span className="text-xs underline">사진 변경</span>
            </div>
            <input type="file" accept="image/*" hidden onChange={(e) => changeAvatar(e.target.files?.[0])} />
          </label>
          <div className="flex gap-2">
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="min-w-0 flex-1 border border-border px-3 py-2 text-sm outline-none focus:border-butter-deep" placeholder="닉네임" />
            <input value={birth} onChange={(e) => setBirth(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-24 border border-border px-3 py-2 text-sm outline-none focus:border-butter-deep" placeholder="출생연도" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="flex-1 bg-primary py-2 text-sm font-semibold disabled:opacity-50">{saved ? "저장됨" : "저장"}</button>
            <button onClick={async () => { await api.auth.signOut(); onClose(); }} className="border border-border px-4 py-2 text-sm hover:bg-accent">로그아웃</button>
          </div>
        </div>
        <div className="px-4 pb-1 pt-3 text-xs font-semibold text-muted-foreground">내 메모 {mine.length}</div>
        {mine.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">아직 남긴 메모가 없어요</div>}
        {mine.map((m) => (
          <div key={m.id} className="flex items-center border-b border-border">
            <button onClick={() => onOpen(m)} className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-accent">
              <div className="truncate text-sm font-semibold">{m.title}</div>
              <div className="truncate text-xs text-muted-foreground">{m.place_name} · {timeAgo(m.created_at)}</div>
            </button>
            <button onClick={() => onEdit(m)} className="p-3 hover:bg-accent" aria-label="수정"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => remove(m)} className="p-3 text-destructive hover:bg-accent" aria-label="삭제"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
