import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Music, Pause, Play, X } from "lucide-react";
import { searchDeezer, type Track } from "@/lib/app";
import { usePlayer } from "@/lib/app";

export function Avatar({ url, name, size = 24 }: { url?: string | null | undefined; name?: string | undefined; size?: number }) {
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size }} className="shrink-0 border border-border object-cover" />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="flex shrink-0 items-center justify-center border border-border bg-primary font-semibold"
    >
      {name?.[0] ?? "?"}
    </div>
  );
}

type Props = { id: number; title: string | null; artist: string | null; cover: string | null };

export function TrackChip({ id, title, artist, cover }: Props) {
  const { current, playing, play } = usePlayer();
  const on = current?.id === id && playing;
  return (
    <button
      type="button"
      onClick={() => play({ id, title: title ?? "", artist: artist ?? "", cover })}
      className={`flex w-full items-center gap-2 border border-foreground p-2 text-left text-sm ${on ? "bg-primary" : "bg-secondary hover:bg-accent"}`}
    >
      {cover && <img src={cover} alt="" className="h-10 w-10" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{artist}</div>
      </div>
      {on ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );
}

export function TrackPicker({ value, onChange }: { value: Track | null; onChange: (t: Track | null) => void }) {
  const search = useServerFn(searchDeezer);
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);

  async function find(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!q.trim()) return;
    setTracks((await search({ data: { q: q.trim() } })).tracks);
  }

  if (value)
    return (
      <div className="flex items-center gap-2 border border-border bg-secondary p-2 text-sm">
        {value.cover && <img src={value.cover} alt="" className="h-10 w-10" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{value.title}</div>
          <div className="truncate text-xs text-muted-foreground">{value.artist}</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
    );

  return (
    <div className="border border-border">
      <form onSubmit={find} className="flex items-center gap-2 px-3">
        <Music className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="노래 검색 후 Enter" className="flex-1 bg-transparent py-2 text-sm outline-none" />
      </form>
      <div className="max-h-56 overflow-y-auto">
        {tracks.map((t) => (
          <button type="button" key={t.id} onClick={() => { onChange(t); setTracks([]); }} className="flex w-full items-center gap-2 border-t border-border p-2 text-left text-sm hover:bg-accent">
            <img src={t.cover} alt="" className="h-8 w-8" />
            <div className="min-w-0">
              <div className="truncate">{t.title}</div>
              <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
