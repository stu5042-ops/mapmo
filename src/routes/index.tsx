import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MessageCircle, PenLine, Search, Users, X } from "lucide-react";
import { fetchAllMemos, memosNear, reverseGeocode, searchPlaces, useAuth, usePlayer, type Memo, type Place, type UserLite } from "@/lib/app";
import { FriendsPanel, MessagesPanel, ProfilePanel } from "@/components/social";
import { MemoCard, MemoDetail, MemoForm } from "@/components/memo";
import { Avatar } from "@/components/common";

const MapView = lazy(() => import("@/components/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "메모맵 — 장소에 남기는 이야기" },
      { name: "description", content: "지도에서 장소를 찾고, 그곳에 남겨진 사람들의 메모와 노래를 둘러보세요." },
      { property: "og:title", content: "메모맵 — 장소에 남기는 이야기" },
      { property: "og:description", content: "지도에서 장소를 찾고, 그곳에 남겨진 사람들의 메모와 노래를 둘러보세요." },
    ],
  }),
  component: Index,
});

type Panel =
  | { kind: "none" }
  | { kind: "place"; place: Place }
  | { kind: "memo"; id: string; back: Panel }
  | { kind: "write"; lat: number; lng: number; name: string }
  | { kind: "profile" }
  | { kind: "edit"; memo: Memo }
  | { kind: "friends" }
  | { kind: "messages"; peer: UserLite | null };

function Index() {
  const { user, profile } = useAuth();
  const { play } = usePlayer();
  const memosQ = useQuery({ queryKey: ["memos"], queryFn: fetchAllMemos });
  const memos = memosQ.data ?? [];
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState("");

  async function doSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setResults(await searchPlaces(q.trim()));
  }

  function openPlace(p: Place) {
    setResults([]);
    setPanel({ kind: "place", place: p });
    setFocus({ lat: p.lat, lng: p.lng });
  }

  function locate(then?: (lat: number, lng: number) => void) {
    if (!navigator.geolocation) return setLocMsg("위치를 사용할 수 없어요");
    setLocMsg("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        setFocus({ ...p });
        setLocMsg("");
        then?.(p.lat, p.lng);
      },
      () => setLocMsg("위치 권한을 허용해주세요"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function startWrite() {
    locate(async (lat, lng) => {
      const name = await reverseGeocode(lat, lng);
      setPanel({ kind: "write", lat, lng, name });
    });
  }

  const currentMemo = panel.kind === "memo" ? memos.find((m) => m.id === panel.id) : undefined;
  const nearby = useMemo(
    () => (panel.kind === "place" ? memosNear(memos, panel.place.lat, panel.place.lng) : []),
    [panel, memos],
  );

  function openMemo(m: Memo) {
    setPanel((prev) => ({ kind: "memo", id: m.id, back: prev.kind === "memo" ? prev.back : prev }));
    setFocus({ lat: m.lat, lng: m.lng });
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ClientOnly fallback={<div className="h-full w-full bg-secondary" />}>
          <Suspense fallback={<div className="h-full w-full bg-secondary" />}>
            <MapView
              memos={memos}
              focus={focus}
              me={me}
              place={panel.kind === "place" ? panel.place : null}
              onMemoClick={openMemo}
              onPlay={(m) => m.track_id && play({ id: m.track_id, title: m.track_title ?? "", artist: m.track_artist ?? "", cover: m.track_cover })}
            />
          </Suspense>
        </ClientOnly>
      </div>

      {/* Search */}
      <div className="absolute left-3 top-3 z-[1000] w-[calc(100%-5.5rem)] max-w-sm border border-border bg-background shadow-sm">
        <form onSubmit={doSearch} className="flex items-center">
          <span className="bg-primary px-3 py-3 text-sm font-bold">메모맵</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="장소 검색"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setResults([]); }} className="px-2"><X className="h-4 w-4" /></button>
          )}
          <button className="px-3" aria-label="검색"><Search className="h-4 w-4" /></button>
        </form>
        {results.length > 0 && (
          <div className="max-h-72 overflow-y-auto border-t border-border">
            {results.map((r, i) => {
              const count = memosNear(memos, r.lat, r.lng).length;
              return (
                <button key={i} onClick={() => openPlace(r)} className="block w-full border-b border-border px-3 py-2 text-left hover:bg-accent">
                  <div className="flex justify-between gap-2 text-sm font-medium">
                    <span className="truncate">{r.name}</span>
                    {count > 0 && <span className="shrink-0 bg-primary px-1.5 text-xs">메모 {count}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{r.full}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Account */}
      <div className="absolute right-3 top-3 z-[1000]">
        {user ? (
          <div className="flex gap-2"><button onClick={() => setPanel({ kind: "friends" })} className="border border-border bg-background p-3 hover:bg-accent" aria-label="친구"><Users className="h-5 w-5" /></button><button onClick={() => setPanel({ kind: "messages", peer: null })} className="border border-border bg-background p-3 hover:bg-accent" aria-label="메시지"><MessageCircle className="h-5 w-5" /></button><button onClick={() => setPanel({ kind: "profile" })} className="border border-border bg-background p-1" aria-label="프로필">
            <Avatar url={profile?.avatar_url} name={profile?.nickname} size={36} />
          </button></div>
        ) : (
          <Link to="/auth" className="block border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-accent">로그인</Link>
        )}
      </div>

      {/* Actions */}
      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col items-end gap-2">
        {locMsg && <div className="border border-border bg-background px-3 py-1.5 text-xs">{locMsg}</div>}
        <button onClick={() => locate()} className="border border-border bg-background p-3 hover:bg-accent" aria-label="내 위치">
          <LocateFixed className="h-5 w-5" />
        </button>
        {user ? (
          <button onClick={startWrite} className="flex items-center gap-2 border border-foreground bg-primary px-4 py-3 font-semibold">
            <PenLine className="h-4 w-4" /> 여기에 메모
          </button>
        ) : (
          <Link to="/auth" className="flex items-center gap-2 border border-foreground bg-primary px-4 py-3 font-semibold">
            <PenLine className="h-4 w-4" /> 로그인하고 메모
          </Link>
        )}
      </div>

      {/* Side panel */}
      {panel.kind !== "none" && (
        <aside className="absolute bottom-0 left-0 z-[1001] h-[60vh] w-full border-t border-border bg-background sm:bottom-3 sm:left-3 sm:top-[4.25rem] sm:h-auto sm:w-96 sm:border">
          {panel.kind === "place" && (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b border-border bg-secondary p-3">
                <div className="min-w-0">
                  <div className="font-bold">{panel.place.name}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{panel.place.full}</div>
                </div>
                <button onClick={() => setPanel({ kind: "none" })} className="p-2 hover:bg-accent" aria-label="닫기"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">이 근처 메모 {nearby.length}</div>
              <div className="flex-1 overflow-y-auto">
                {nearby.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">아직 남겨진 메모가 없어요</div>}
                {nearby.map((m) => <MemoCard key={m.id} memo={m} onClick={() => openMemo(m)} />)}
              </div>
            </div>
          )}
          {panel.kind === "memo" && currentMemo && (
            <MemoDetail memo={currentMemo} onBack={() => setPanel(panel.back)} />
          )}
          {panel.kind === "write" && (
            <MemoForm lat={panel.lat} lng={panel.lng} placeName={panel.name} onClose={() => setPanel({ kind: "none" })} />
          )}
          {panel.kind === "profile" && <ProfilePanel memos={memos} onClose={() => setPanel({ kind: "none" })} onOpen={openMemo} onEdit={(m) => setPanel({ kind: "edit", memo: m })} />}
          {panel.kind === "edit" && <MemoForm memo={panel.memo} lat={panel.memo.lat} lng={panel.memo.lng} placeName={panel.memo.place_name ?? ""} onClose={() => setPanel({ kind: "profile" })} />}
          {panel.kind === "friends" && user && <FriendsPanel memos={memos} onClose={() => setPanel({ kind: "none" })} onOpenMemo={openMemo} onMessage={(u) => setPanel({ kind: "messages", peer: u })} />}
          {panel.kind === "messages" && user && <MessagesPanel initial={panel.peer} onClose={() => setPanel({ kind: "none" })} onFocus={(lat, lng) => setFocus({ lat, lng })} />}
        </aside>
      )}
    </div>
  );
}
