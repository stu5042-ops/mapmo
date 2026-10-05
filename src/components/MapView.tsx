import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Memo } from "@/lib/app";

type Props = {
  memos: Memo[];
  focus: { lat: number; lng: number; zoom?: number } | null;
  place: { lat: number; lng: number } | null;
  me: { lat: number; lng: number } | null;
  onMemoClick: (m: Memo) => void;
  onPlay: (m: Memo) => void;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function cardHtml(m: Memo, count: number) {
  const music = m.track_id
    ? `<div class="card-music">♪ ${esc(m.track_title ?? "")}</div>`
    : "";
  const body = m.image_url
    ? `<div class="card-body"><img src="${esc(m.image_url)}" class="card-img"/><div class="card-title">${esc(m.title)}</div></div>`
    : `<div class="card-body"><div><div class="card-title">${esc(m.title)}</div><div class="card-text">${esc(m.content.slice(0, 60))}</div></div></div>`;
  const badge = count > 1 ? `<div class="card-count">+${count - 1}</div>` : "";
  return `<div class="memo-card">${music}${body}${badge}</div>`;
}

export default function MapView({ memos, focus, place, me, onMemoClick, onPlay }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const memoLayer = useRef<L.LayerGroup | null>(null);
  const placeMarker = useRef<L.Marker | null>(null);
  const meMarker = useRef<L.Marker | null>(null);
  const cb = useRef({ onMemoClick, onPlay });
  cb.current = { onMemoClick, onPlay };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false }).setView([37.5665, 126.978], 13);
    L.control.zoom({ position: "bottomleft" }).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(m);
    memoLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = memoLayer.current;
    if (!layer) return;
    layer.clearLayers();
    // group by ~10m spot; memos are sorted newest first
    const groups = new Map<string, Memo[]>();
    memos.forEach((m) => {
      const k = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
      const g = groups.get(k);
      if (g) g.push(m);
      else groups.set(k, [m]);
    });
    groups.forEach((g) => {
      const latest = g[0]!;
      const icon = L.divIcon({ className: "", html: cardHtml(latest, g.length), iconSize: [150, 0], iconAnchor: [75, 0] });
      L.marker([latest.lat, latest.lng], { icon })
        .on("click", (e) => {
          const target = (e as L.LeafletMouseEvent).originalEvent?.target as HTMLElement | null;
          if (target?.closest(".card-music")) cb.current.onPlay(latest);
          else cb.current.onMemoClick(latest);
        })
        .addTo(layer);
    });
  }, [memos]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], focus.zoom ?? 16, { duration: 0.8 });
  }, [focus]);

  useEffect(() => {
    if (!map.current) return;
    placeMarker.current?.remove();
    placeMarker.current = null;
    if (place) {
      const icon = L.divIcon({ className: "", html: '<div class="place-pin"></div>', iconSize: [22, 22] });
      placeMarker.current = L.marker([place.lat, place.lng], { icon, zIndexOffset: -100 }).addTo(map.current);
    }
  }, [place]);

  useEffect(() => {
    if (!map.current) return;
    meMarker.current?.remove();
    if (me) {
      const icon = L.divIcon({ className: "", html: '<div class="me-pin"></div>', iconSize: [16, 16] });
      meMarker.current = L.marker([me.lat, me.lng], { icon, zIndexOffset: -50 }).addTo(map.current);
    }
  }, [me]);

  return <div ref={el} className="h-full w-full" />;
}
