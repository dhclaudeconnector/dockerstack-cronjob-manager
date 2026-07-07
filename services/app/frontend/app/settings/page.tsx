"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";

interface Health {
  status: string;
  rtdb?: string;
  time?: number;
  error?: string;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health-check", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealth({ status: "offline", error: String(e) }));
  }, []);

  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 overflow-auto p-container-padding">
        <div className="max-w-3xl mx-auto space-y-gutter py-2">
          <h2 className="text-h1 text-on-background">Settings</h2>

          <Card title="Backend Connection">
            <Row label="Status">
              <span
                className={`inline-flex items-center gap-2 text-body-sm ${
                  health?.status === "ok" ? "text-emerald-600" : "text-error"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    health?.status === "ok" ? "bg-emerald-500" : "bg-error"
                  }`}
                />
                {health?.status === "ok" ? "Connected" : health ? "Offline" : "Checking…"}
              </span>
            </Row>
            <Row label="RTDB Mode">
              <span className="font-code text-code text-on-surface">{health?.rtdb ?? "—"}</span>
            </Row>
            <Row label="API Secret">
              <span className="font-code text-code text-on-surface-variant">
                injected server-side (never exposed to client)
              </span>
            </Row>
          </Card>

          <Card title="How it works">
            <ul className="text-body-sm text-on-surface-variant space-y-2 list-disc pl-5">
              <li>
                The browser calls <code className="font-code text-code bg-surface-container px-1 rounded">/proxy/*</code>,
                a Next.js server route that forwards to the backend and injects the{" "}
                <code className="font-code text-code bg-surface-container px-1 rounded">x-api-secret</code> header.
              </li>
              <li>The backend is the only component talking to cronjob.org and Firebase RTDB.</li>
              <li>
                Secrets (cronjob.org API keys, GitHub tokens, Azure PATs) are stored in RTDB, optionally AES-256-GCM
                encrypted, and always masked in API responses.
              </li>
              <li>
                The executor runs whitelisted <code className="font-code text-code bg-surface-container px-1 rounded">.mjs</code>{" "}
                handlers with a timeout; the RTDB queue processes jobs FIFO and resumes after restarts.
              </li>
            </ul>
          </Card>

          <Card title="Environment (backend)">
            <pre className="bg-inverse-surface text-inverse-on-surface font-code text-[11px] rounded-lg p-3 overflow-auto">
{`API_SECRET=...              # required for every /api call
FIREBASE_DB_URL=...
FIREBASE_SERVICE_ACCOUNT=   # preferred (JSON / base64 / path)
FIREBASE_AUTH_SECRET=       # fallback
CRONJOB_API_BASE=https://api.cron-job.org
EXEC_HANDLERS_DIR=./handlers
EXEC_ALLOWED=[]             # whitelist handler names
SECRET_ENCRYPTION_KEY=      # optional at-rest encryption`}
            </pre>
          </Card>
        </div>
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant/20 rounded-lg p-4">
      <h3 className="text-h2 text-on-surface mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-outline-variant/10 last:border-0">
      <span className="text-label-caps text-on-surface-variant uppercase">{label}</span>
      {children}
    </div>
  );
}
