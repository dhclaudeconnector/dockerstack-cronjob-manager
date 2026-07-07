"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { StatusBadge } from "@/components/ui";
import { api, type JobMeta, type QueueItem, type ExecLog } from "@/lib/api";

function relTime(ts?: number) {
  if (!ts) return "--";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 60) return diff > 0 ? `In ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return diff > 0 ? `In ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return diff > 0 ? `In ${d}d` : `${d}d ago`;
}

interface Counts {
  accounts: number;
  tokens: number;
  pats: number;
  jobsActive: number;
  jobsInactive: number;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({
    accounts: 0,
    tokens: 0,
    pats: 0,
    jobsActive: 0,
    jobsInactive: 0,
  });
  const [jobs, setJobs] = useState<JobMeta[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [logs, setLogs] = useState<ExecLog[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [accounts, tokens, pats, jobList, q, execLogs] = await Promise.all([
        api.get<any[]>("accounts"),
        api.get<any[]>("github-tokens"),
        api.get<any[]>("azure-pats"),
        api.get<JobMeta[]>("jobs"),
        api.get<QueueItem[]>("exec/queue"),
        api.get<ExecLog[]>("logs/exec"),
      ]);
      setCounts({
        accounts: accounts.length,
        tokens: tokens.length,
        pats: pats.length,
        jobsActive: jobList.filter((j) => j.enabled).length,
        jobsInactive: jobList.filter((j) => !j.enabled).length,
      });
      setJobs(jobList.slice(0, 6));
      setQueue(q);
      setLogs(execLogs.slice(0, 8));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const qRunning = queue.filter((j) => j.status === "processing").length;
  const qPending = queue.filter((j) => j.status === "pending").length;
  const qFailed = queue.filter((j) => j.status === "failed").length;

  return (
    <>
      <Topbar title="CronOps Console" />
      <main className="flex-1 overflow-y-auto p-container-padding lg:p-6 custom-scrollbar">
        <div className="max-w-[1600px] mx-auto space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-h1 text-on-surface tracking-tight">Resources Overview</h1>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Multi-account cronjob.org control plane
                <span className="font-code text-code bg-surface-container-high px-1 py-0.5 rounded ml-2">
                  RTDB-backed
                </span>
              </p>
            </div>
            <button
              onClick={load}
              className="px-3 py-1.5 border border-outline-variant/30 rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Sync
            </button>
          </div>

          {err && (
            <div className="bg-error-container/40 border border-error/30 text-on-error-container rounded-lg px-4 py-2 text-body-sm">
              {err}
            </div>
          )}

          {/* Stat grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
            <StatCard icon="group" label="Total Accounts" value={counts.accounts} />
            <StatCard icon="key" label="GitHub Tokens" value={counts.tokens} />
            <StatCard icon="cloud" label="Azure PATs" value={counts.pats} />
            <div className="bg-surface border border-outline-variant/20 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <span className="text-label-caps text-on-surface-variant uppercase">Executor Queue</span>
                <span className="material-symbols-outlined text-[16px] text-outline">terminal</span>
              </div>
              <div className="flex gap-3 mt-1">
                <QueueStat label="Running" value={qRunning} tone="text-primary" />
                <QueueStat label="Pending" value={qPending} tone="text-on-surface" border />
                <QueueStat label="Failed" value={qFailed} tone="text-error" border />
              </div>
            </div>
          </div>

          {/* Bento */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            <div className="lg:col-span-2 bg-surface border border-outline-variant/20 rounded-lg flex flex-col">
              <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center">
                <h3 className="text-h2 text-on-surface">Active Job Status</h3>
                <Link href="/cronjobs" className="text-primary text-body-xs hover:underline">
                  View All Jobs
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-low/50">
                      {["Job", "Account", "Status", "Next Run"].map((h) => (
                        <th key={h} className="px-4 py-2 text-label-caps text-on-surface-variant">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-outline text-body-sm">
                          No jobs yet — create an account, then sync jobs from cronjob.org.
                        </td>
                      </tr>
                    )}
                    {jobs.map((j) => (
                      <tr
                        key={j.id}
                        className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors h-row-height-sm"
                      >
                        <td className="px-4 py-1 font-code text-code text-on-surface truncate max-w-[180px]">
                          {j.title}
                        </td>
                        <td className="px-4 py-1 text-body-sm text-on-surface-variant truncate max-w-[120px]">
                          {j.accountId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-1">
                          <StatusBadge
                            status={j.enabled ? (j.lastStatus ?? "running") : "disabled"}
                            label={j.enabled ? (j.lastStatus ?? "Active") : "Disabled"}
                          />
                        </td>
                        <td className="px-4 py-1 font-code text-code text-on-surface-variant">
                          {j.enabled ? relTime(j.nextRunAt) : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent exec logs */}
            <div className="bg-surface border border-outline-variant/20 rounded-lg p-4 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-h2 text-on-surface">Recent Executions</h3>
                <Link href="/logs" className="text-outline hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </Link>
              </div>
              <div className="bg-inverse-surface rounded-lg p-3 flex-1 overflow-auto font-code text-[11px] leading-[16px] text-outline-variant/80 space-y-1 min-h-[220px]">
                {logs.length === 0 && <div className="text-outline">No executions yet.</div>}
                {logs.map((l) => (
                  <div key={l.execId} className="flex gap-2">
                    <span className="text-on-secondary-fixed">
                      {new Date(l.startedAt).toLocaleTimeString()}
                    </span>
                    <span className={l.status === "ok" ? "text-primary-fixed-dim" : "text-error-container"}>
                      {l.status === "ok" ? "OK " : "ERR"}
                    </span>
                    <span className="truncate">
                      [{l.target.name}] {l.error ?? l.outputPreview ?? `${l.durationMs}ms`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-surface border border-outline-variant/20 rounded-lg p-4 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2">
        <span className="text-label-caps text-on-surface-variant uppercase">{label}</span>
        <span className="material-symbols-outlined text-[16px] text-outline">{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-h1 text-on-surface font-code">{value}</span>
      </div>
    </div>
  );
}

function QueueStat({
  label,
  value,
  tone,
  border,
}: {
  label: string;
  value: number;
  tone: string;
  border?: boolean;
}) {
  return (
    <div className={`flex flex-col ${border ? "border-l border-outline-variant/20 pl-3" : ""}`}>
      <span className="text-body-xs text-on-surface-variant">{label}</span>
      <span className={`text-h2 font-code ${tone}`}>{value}</span>
    </div>
  );
}
