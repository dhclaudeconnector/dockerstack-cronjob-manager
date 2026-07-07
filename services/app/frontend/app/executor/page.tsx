"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { StatusBadge } from "@/components/ui";
import { api, type HandlerInfo, type QueueItem } from "@/lib/api";

export default function ExecutorPage() {
  const [handlers, setHandlers] = useState<HandlerInfo>({ files: [], fns: [] });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [runFor, setRunFor] = useState<{ type: "file" | "fn"; name: string } | null>(null);

  const load = async () => {
    try {
      const [h, q] = await Promise.all([
        api.get<HandlerInfo>("exec/handlers"),
        api.get<QueueItem[]>("exec/queue"),
      ]);
      setHandlers(h);
      setQueue(q);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const allHandlers = [
    ...handlers.files.map((f) => ({ type: "file" as const, name: f.name, file: f.file })),
    ...handlers.fns.map((n) => ({ type: "fn" as const, name: n, file: "(registered fn)" })),
  ];

  return (
    <>
      <Topbar title="Executor" />
      <main className="flex-1 overflow-auto p-container-padding">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {err && (
            <div className="lg:col-span-12 bg-error-container/40 border border-error/30 text-on-error-container rounded-lg px-4 py-2 text-body-sm">
              {err}
            </div>
          )}

          {/* Handlers */}
          <section className="lg:col-span-5 flex flex-col gap-unit">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-h2 text-on-surface">Available Handlers</h3>
              <span className="text-body-xs text-outline bg-surface-container-low px-2 py-1 rounded border border-outline-variant/20">
                {allHandlers.length} Handlers
              </span>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden flex flex-col">
              {allHandlers.length === 0 && (
                <div className="p-4 text-outline text-body-sm">No handlers in the executor directory.</div>
              )}
              {allHandlers.map((h, i) => (
                <div
                  key={`${h.type}:${h.name}`}
                  className={`flex items-center justify-between p-3 hover:bg-surface-container-low transition-colors group ${
                    i < allHandlers.length - 1 ? "border-b border-outline-variant/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline">
                      {h.type === "file" ? "description" : "functions"}
                    </span>
                    <div>
                      <p className="font-code text-code text-on-surface">
                        {h.type === "file" ? `/handlers/${h.name}.mjs` : `fn:${h.name}`}
                      </p>
                      <p className="text-body-xs text-outline truncate max-w-[240px]">{h.file}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setRunFor({ type: h.type, name: h.name })}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 rounded text-body-xs font-bold border border-primary/20 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">play_arrow</span> Run Now
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Queue */}
          <section className="lg:col-span-7 flex flex-col gap-unit">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-h2 text-on-surface">RTDB Queue</h3>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary-container opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary-container" />
                </span>
              </div>
              <button
                onClick={load}
                className="px-3 py-1 text-body-xs font-bold rounded border border-outline-variant hover:bg-surface-container-highest transition-colors flex items-center gap-1 text-on-surface"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span> Refresh
              </button>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg overflow-hidden flex flex-col">
              <div className="grid grid-cols-12 gap-2 p-2 bg-surface-container-low border-b border-outline-variant/20 text-label-caps text-outline items-center">
                <div className="col-span-3 pl-2">Push Key</div>
                <div className="col-span-4">Target</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-3 text-right pr-2">Created</div>
              </div>
              <div className="divide-y divide-outline-variant/10 max-h-[520px] overflow-y-auto">
                {queue.length === 0 && (
                  <div className="p-4 text-outline text-body-sm">Queue is empty.</div>
                )}
                {queue
                  .slice()
                  .reverse()
                  .map((j) => (
                    <div key={j.key} className="grid grid-cols-12 gap-2 p-2 items-center hover:bg-surface-container-low transition-colors">
                      <div className="col-span-3 pl-2 font-code text-code text-on-surface-variant truncate">
                        {j.key.slice(0, 14)}
                      </div>
                      <div className="col-span-4 font-code text-code text-on-surface truncate">
                        {j.target.type}:{j.target.name}
                      </div>
                      <div className="col-span-2">
                        <StatusBadge status={j.status} label={j.status} />
                      </div>
                      <div className="col-span-3 text-right pr-2 font-code text-code text-outline">
                        {new Date(j.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {runFor && (
        <RunModal
          target={runFor}
          onClose={() => setRunFor(null)}
          onRan={() => load()}
        />
      )}
    </>
  );
}

function RunModal({
  target,
  onClose,
  onRan,
}: {
  target: { type: "file" | "fn"; name: string };
  onClose: () => void;
  onRan: () => void;
}) {
  const [payload, setPayload] = useState('{\n  "region": "us-east-1",\n  "batch": 100\n}');
  const [mode, setMode] = useState<"sync" | "queue">("sync");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      let data: unknown = {};
      if (payload.trim()) data = JSON.parse(payload);
      if (mode === "sync") {
        const res = await api.post<any>(`exec/${target.type}/${target.name}`, data);
        setResult(res);
      } else {
        const res = await api.post<any>("exec/enqueue", { target, data });
        setResult(res);
      }
      onRan();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant/20">
          <h3 className="text-h2 text-on-surface font-code">
            Run {target.type}:{target.name}
          </h3>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {(["sync", "queue"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-body-sm ${
                  mode === m ? "bg-primary text-on-primary" : "bg-surface-container border border-outline-variant/20"
                }`}
              >
                {m === "sync" ? "Run now (sync)" : "Enqueue (RTDB)"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Payload (JSON)</span>
            <textarea
              className="w-full bg-inverse-surface text-inverse-on-surface font-code text-code rounded-lg px-3 py-2 h-40 outline-none focus:ring-2 focus:ring-primary"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </label>
          {err && <p className="text-error text-body-xs">{err}</p>}
          {result && (
            <div className="bg-inverse-surface rounded-lg p-3 font-code text-[11px] text-inverse-on-surface max-h-40 overflow-auto">
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm">
              Close
            </button>
            <button
              onClick={run}
              disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              {busy ? "Running..." : "Execute"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
