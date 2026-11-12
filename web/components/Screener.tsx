"use client";

import { useEffect, useMemo } from "react";
import { MARKUP } from "@/lib/screener-markup";
import { createClient } from "@/lib/supabase/client";
import { DATA_BUCKET, DATA_FILE } from "@/lib/supabase/env";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Muat turun bursa.json.gz dari storan Supabase (hanya untuk pengguna yang log masuk) dan nyahmampat.
async function loadFeed() {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(DATA_BUCKET).download(DATA_FILE, {}, { cache: "no-store" });
  if (error || !data) throw error ?? new Error("Tiada data");
  return await parseFeed(data);
}

// Fail dimampat gzip; tetapi jika pelayan sudah menyahmampat (Content-Encoding), baca terus.
async function parseFeed(blob: Blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return JSON.parse(await blob.text());
  return await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

export default function Screener({ email }: { email: string }) {
  const html = useMemo(() => MARKUP.replace("__EMAIL__", esc(email)), [email]);
  useEffect(() => {
    import("@/lib/screener-engine.js").then((m) => m.startScreener({ loadFeed }));
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
