import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart, ImagePlus, MapPin, MessageSquare, Music, Trash2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, timeAgo, uploadMedia, useAuth, type Memo, type Track } from "@/lib/app";
import { Avatar, TrackChip, TrackPicker } from "./common";

export function MemoCard({ memo, onClick }: { memo: Memo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full gap-3 border-b border-border p-3 text-left transition-colors hover:bg-accent"
    >
      {memo.image_url && (
        <img src={memo.image_url} alt="" className="h-16 w-16 shrink-0 object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{memo.title}</div>
        <div className="line-clamp-2 text-sm text-muted-foreground">{memo.content}</div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{memo.profiles?.nickname}</span>
          <span>{timeAgo(memo.created_at)}</span>
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{memo.memo_likes.length}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{memo.memo_comments[0]?.count ?? 0}</span>
          {memo.track_id && <Music className="h-3 w-3" />}
        </div>
      </div>
    </button>
  );
}

type Props = { lat: number; lng: number; placeName: string; onClose: () => void; memo?: Memo };

export function MemoForm({ lat, lng, placeName, onClose, memo }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState(memo?.title ?? "");
  const [content, setContent] = useState(memo?.content ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(memo?.image_url ?? null);
  const [track, setTrack] = useState<Track | null>(
    memo?.track_id
      ? { id: memo.track_id, title: memo.track_title ?? "", artist: memo.track_artist ?? "", cover: memo.track_cover ?? "", link: memo.track_link ?? "" }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!user || !title.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const image_url = file ? await uploadMedia(user.id, file) : imageUrl;
      const fields = {
        title: title.trim(),
        content,
        image_url,
        track_id: track?.id ?? null,
        track_title: track?.title ?? null,
        track_artist: track?.artist ?? null,
        track_cover: track?.cover ?? null,
        track_link: track?.link ?? null,
      };
      const { error } = memo
        ? await api.from("memos").update(fields).eq("id", memo.id)
        : await api.from("memos").insert({ ...fields, lat, lng, place_name: placeName });
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ["memos"] });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  const [preview, setPreview] = useState<string | null>(imageUrl);

  useEffect(() => {
    if (!file) {
      setPreview(imageUrl);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, imageUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div>
          <div className="font-semibold">{memo ? "메모 수정" : "새 메모"}</div>
          <div className="text-xs text-muted-foreground">{memo?.place_name ?? placeName}</div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-accent" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className="w-full border border-border px-3 py-2 font-semibold outline-none focus:border-butter-deep" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="이곳에서의 이야기를 남겨보세요" rows={7} className="w-full resize-none border border-border px-3 py-2 outline-none focus:border-butter-deep" />
        <label className="flex cursor-pointer items-center gap-2 border border-dashed border-border px-3 py-2 text-sm hover:bg-accent">
          <ImagePlus className="h-4 w-4" />
          {file ? file.name : preview ? "사진 바꾸기" : "사진 추가"}
          <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {preview && (
          <div className="relative">
            <img src={preview} alt="" className="max-h-48 w-full object-cover" />
            <button onClick={() => { setFile(null); setImageUrl(null); }} className="absolute right-1 top-1 bg-background p-1" aria-label="사진 빼기"><X className="h-4 w-4" /></button>
          </div>
        )}
        <TrackPicker value={track} onChange={setTrack} />
        {err && <div className="text-sm text-destructive">{err}</div>}
      </div>
      <button onClick={submit} disabled={busy || !title.trim()} className="bg-primary py-3 font-semibold disabled:opacity-50">
        {busy ? "저장 중…" : memo ? "수정 완료" : "메모 남기기"}
      </button>
    </div>
  );
}

export function MemoDetail({ memo, onBack }: { memo: Memo; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const liked = !!user && memo.memo_likes.some((l) => l.user_id === user.id);

  const comments = useQuery({
    queryKey: ["comments", memo.id],
    queryFn: async () => {
      const { data, error } = await api
        .from("memo_comments")
        .select("id, content, created_at, user_id, profiles(nickname, avatar_url)")
        .eq("memo_id", memo.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function toggleLike() {
    if (!user) return;
    if (liked) await api.from("memo_likes").delete().eq("memo_id", memo.id).eq("user_id", user.id);
    else await api.from("memo_likes").insert({ memo_id: memo.id });
    qc.invalidateQueries({ queryKey: ["memos"] });
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    await api.from("memo_comments").insert({ memo_id: memo.id, content: text.trim() });
    setText("");
    comments.refetch();
    qc.invalidateQueries({ queryKey: ["memos"] });
  }

  async function removeMemo() {
    if (!confirm("이 메모를 삭제할까요?")) return;
    await api.from("memos").delete().eq("id", memo.id);
    qc.invalidateQueries({ queryKey: ["memos"] });
    onBack();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-2">
        <button onClick={onBack} className="p-2 hover:bg-accent" aria-label="뒤로"><ArrowLeft className="h-4 w-4" /></button>
        {user?.id === memo.user_id && (
          <button onClick={removeMemo} className="p-2 text-destructive hover:bg-accent" aria-label="삭제"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {memo.image_url && <img src={memo.image_url} alt="" className="max-h-80 w-full object-cover" />}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Avatar url={memo.profiles?.avatar_url} name={memo.profiles?.nickname} />
            <span className="font-medium">{memo.profiles?.nickname}</span>
            <span className="text-muted-foreground">· {timeAgo(memo.created_at)}</span>
          </div>
          <h2 className="text-xl font-bold">{memo.title}</h2>
          {memo.place_name && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{memo.place_name}</div>
          )}
          <p className="mt-3 whitespace-pre-wrap leading-relaxed">{memo.content}</p>
          {memo.track_id && (
            <div className="mt-4">
              <TrackChip id={memo.track_id} title={memo.track_title} artist={memo.track_artist} cover={memo.track_cover} />
            </div>
          )}
          <button
            onClick={toggleLike}
            disabled={!user}
            className={`mt-4 flex items-center gap-2 border border-border px-3 py-1.5 text-sm ${liked ? "bg-primary" : "hover:bg-accent"}`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} /> {memo.memo_likes.length}
          </button>
        </div>
        <div className="border-t border-border p-4">
          <div className="mb-2 text-sm font-semibold">댓글 {comments.data?.length ?? 0}</div>
          {comments.data?.map((c) => (
            <div key={c.id} className="border-b border-border py-2 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar url={c.profiles?.avatar_url} name={c.profiles?.nickname} size={20} />
                <span className="font-medium text-foreground">{c.profiles?.nickname}</span>
                {timeAgo(c.created_at)}
              </div>
              <div className="mt-1">{c.content}</div>
            </div>
          ))}
        </div>
      </div>
      {user ? (
        <form onSubmit={addComment} className="flex border-t border-border">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="댓글 달기"
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none"
          />
          <button className="bg-primary px-4 text-sm font-medium">등록</button>
        </form>
      ) : (
        <Link to="/auth" className="block border-t border-border bg-secondary p-3 text-center text-sm">
          로그인하고 좋아요·댓글 남기기
        </Link>
      )}
    </div>
  );
}
