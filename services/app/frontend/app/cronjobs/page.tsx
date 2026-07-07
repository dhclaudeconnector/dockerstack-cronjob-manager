"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Tag, Toggle, StatusDot } from "@/components/ui";
import {
  api,
  type JobMeta,
  type Resource,
  type JobLog,
  type JobSchedule,
  type RequestMethodValue,
  type ExtendedJobData,
  type GithubRepo,
  type GithubWorkflow,
  type GithubBranch,
  type AzureProject,
  type AzurePipeline,
  type CurlResult,
  REQUEST_METHODS,
} from "@/lib/api";

function relTime(ts?: number, enabled = true) {
  if (!enabled) return "Disabled";
  if (!ts) return "--";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  if (m < 60) return diff > 0 ? `In ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return diff > 0 ? `In ${h}h ${m % 60}m` : `${h}h ago`;
  const d = Math.round(h / 24);
  return diff > 0 ? `In ${d}d` : `${d}d ago`;
}

function CronjobsInner() {
  const params = useSearchParams();
  const [jobs, setJobs] = useState<JobMeta[]>([]);
  const [accounts, setAccounts] = useState<Resource[]>([]);
  const [githubTokens, setGithubTokens] = useState<Resource[]>([]);
  const [azurePats, setAzurePats] = useState<Resource[]>([]);
  const [filterAccount, setFilterAccount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(params.get("new") === "1");
  const [logsFor, setLogsFor] = useState<JobMeta | null>(null);

  const load = async () => {
    try {
      const [j, a, t, az] = await Promise.all([
        api.get<JobMeta[]>(`jobs${filterAccount ? `?accountId=${filterAccount}` : ""}`),
        api.get<Resource[]>("accounts"),
        api.get<Resource[]>("github-tokens"),
        api.get<Resource[]>("azure-pats"),
      ]);
      setJobs(j);
      setAccounts(a);
      setGithubTokens(t);
      setAzurePats(az);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => { load(); }, [filterAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncAll = async () => {
    try {
      for (const a of accounts) await api.post(`jobs/sync?accountId=${a.id}`);
      load();
    } catch (e) { setErr((e as Error).message); }
  };

  const toggle = async (job: JobMeta, enabled: boolean) => {
    try { await api.post(`jobs/${job.id}/${enabled ? "enable" : "disable"}`); load(); }
    catch (e) { setErr((e as Error).message); }
  };

  const remove = async (job: JobMeta) => {
    if (!confirm(`Delete job "${job.title}"?`)) return;
    await api.del(`jobs/${job.id}`);
    load();
  };

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id.slice(0, 8);

  return (
    <>
      <Topbar title="Cronjobs" />
      <main className="flex-1 overflow-auto p-container-padding">
        <div className="max-w-[1600px] mx-auto space-y-gutter">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 py-2">
            <h2 className="text-h1 text-on-background">Cronjobs</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 rounded-lg px-2 py-1">
                <span className="text-body-xs text-outline">Account:</span>
                <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
                  className="bg-transparent border-none text-body-sm py-0.5 pr-6 h-6 text-on-surface focus:ring-0 cursor-pointer">
                  <option value="">All Accounts</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <button onClick={syncAll}
                className="h-8 px-3 bg-surface-variant rounded-lg text-body-sm border border-outline-variant/20 hover:bg-surface-dim transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">sync</span>Sync All
              </button>
              <button onClick={() => setShowNew(true)}
                className="h-8 px-3 bg-primary text-on-primary rounded-lg text-body-sm hover:bg-primary-container transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">add</span>New Job
              </button>
            </div>
          </div>

          {err && <div className="bg-error-container/40 border border-error/30 text-on-error-container rounded-lg px-4 py-2 text-body-sm">{err}</div>}

          <div className="bg-surface border border-outline-variant/20 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                  <th className="py-2 px-3 text-label-caps text-outline w-10 text-center">St</th>
                  <th className="py-2 px-3 text-label-caps text-outline">Job Title</th>
                  <th className="py-2 px-3 text-label-caps text-outline">Account</th>
                  <th className="py-2 px-3 text-label-caps text-outline w-48">URL</th>
                  <th className="py-2 px-3 text-label-caps text-outline w-40">Next Run</th>
                  <th className="py-2 px-3 text-label-caps text-outline w-40">Tags</th>
                  <th className="py-2 px-3 text-label-caps text-outline w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-body-sm">
                {jobs.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-outline">No jobs. Add a cronjob account under Resources, then "Sync All" or "New Job".</td></tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.id}
                    className={`border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors h-row-height-sm group ${j.lastStatus === "failed" ? "bg-error-container/5" : ""}`}>
                    <td className="py-1 px-3 text-center"><StatusDot status={j.enabled ? (j.lastStatus ?? "ok") : "disabled"} /></td>
                    <td className={`py-1 px-3 font-semibold truncate max-w-[200px] ${j.enabled ? "text-on-surface" : "text-outline"}`}>{j.title}</td>
                    <td className="py-1 px-3 text-on-surface-variant truncate max-w-[130px]">{accountLabel(j.accountId)}</td>
                    <td className="py-1 px-3 font-code text-code text-primary truncate max-w-[200px]">{j.url}</td>
                    <td className={`py-1 px-3 font-code text-code ${j.lastStatus === "failed" ? "text-error" : "text-on-surface-variant"}`}>{relTime(j.nextRunAt, j.enabled)}</td>
                    <td className="py-1 px-3">
                      <div className="flex gap-1 flex-wrap">{(j.tags ?? []).map((t) => <Tag key={t} tone={t.toLowerCase().includes("prod") ? "prod" : "neutral"}>{t}</Tag>)}</div>
                    </td>
                    <td className="py-1 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setLogsFor(j)} className="text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100" title="Logs">
                          <span className="material-symbols-outlined text-[16px]">list_alt</span>
                        </button>
                        <button onClick={() => remove(j)} className="text-outline hover:text-error transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                        <Toggle checked={j.enabled} onChange={(v) => toggle(j, v)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-surface-container-lowest border-t border-outline-variant/20 py-1.5 px-3 text-body-xs text-outline">
              Showing {jobs.length} job{jobs.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </main>

      {showNew && <NewJobModal accounts={accounts} githubTokens={githubTokens} azurePats={azurePats} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {logsFor && <JobLogsModal job={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}

export default function CronjobsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-outline">Loading…</div>}>
      <CronjobsInner />
    </Suspense>
  );
}

/* ─── Modal: click bên ngoài KHÔNG đóng, chỉ đóng bằng nút ─── */
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant/20">
          <h3 className="text-h2 text-on-surface">{title}</h3>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

type SchedulePreset = "5min" | "15min" | "hourly" | "daily" | "weekly" | "custom";
type JobTab = "basic" | "schedule" | "headers" | "gh" | "azure";

const SCHEDULE_PRESETS: Record<SchedulePreset, { label: string; schedule: JobSchedule }> = {
  "5min": { label: "Every 5 minutes", schedule: { minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] } },
  "15min": { label: "Every 15 minutes", schedule: { minutes: [0, 15, 30, 45] } },
  hourly: { label: "Every hour", schedule: { minutes: [0] } },
  daily: { label: "Daily at midnight", schedule: { hours: [0], minutes: [0] } },
  weekly: { label: "Weekly (Mon at midnight)", schedule: { wdays: [1], hours: [0], minutes: [0] } },
  custom: { label: "Custom", schedule: {} },
};

function NewJobModal({ accounts, githubTokens, azurePats, onClose, onSaved }: {
  accounts: Resource[]; githubTokens: Resource[]; azurePats: Resource[]; onClose: () => void; onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("https://");
  const [tags, setTags] = useState("");
  const [requestMethod, setRequestMethod] = useState<RequestMethodValue>(0);
  const [headersJson, setHeadersJson] = useState("");
  const [body, setBody] = useState("");
  const [saveResponses, setSaveResponses] = useState(true);
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>("hourly");
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("0");
  const [customMdays, setCustomMdays] = useState("");
  const [customWdays, setCustomWdays] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [curlResult, setCurlResult] = useState<CurlResult | null>(null);
  const [tab, setTab] = useState<JobTab>("basic");

  // GitHub fetch state
  const [ghTokenId, setGhTokenId] = useState("");
  const [ghRepos, setGhRepos] = useState<GithubRepo[]>([]);
  const [ghSelectedRepo, setGhSelectedRepo] = useState("");
  const [ghWorkflows, setGhWorkflows] = useState<GithubWorkflow[]>([]);
  const [ghSelectedWorkflow, setGhSelectedWorkflow] = useState("");
  const [ghBranches, setGhBranches] = useState<GithubBranch[]>([]);
  const [ghRef, setGhRef] = useState("main");
  const [ghInputs, setGhInputs] = useState("{}");
  const [ghLoading, setGhLoading] = useState(false);

  // Azure fetch state
  const [azPatId, setAzPatId] = useState("");
  const [azOrganization, setAzOrganization] = useState("");
  const [azProjects, setAzProjects] = useState<AzureProject[]>([]);
  const [azSelectedProject, setAzSelectedProject] = useState("");
  const [azPipelines, setAzPipelines] = useState<AzurePipeline[]>([]);
  const [azSelectedPipeline, setAzSelectedPipeline] = useState("");
  const [azLoading, setAzLoading] = useState(false);

  const inputCls = "w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-body-sm text-on-surface focus:ring-2 focus:ring-primary outline-none";
  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-body-sm rounded-lg border transition-colors ${active ? "bg-primary text-on-primary border-primary" : "bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-dim"}`;

  // GitHub fetch handlers
  const fetchGhRepos = useCallback(async (tokenId: string) => {
    if (!tokenId) return;
    setGhLoading(true);
    try {
      const repos = await api.get<GithubRepo[]>(`github-tokens/${tokenId}/repos`);
      setGhRepos(repos);
      setGhSelectedRepo(""); setGhWorkflows([]); setGhSelectedWorkflow(""); setGhBranches([]);
    } catch (e) { setErr(`Fetch repos failed: ${(e as Error).message}`); }
    setGhLoading(false);
  }, []);

  const fetchGhWorkflows = useCallback(async (tokenId: string, owner: string, repo: string) => {
    setGhLoading(true);
    try {
      const [workflows, branches] = await Promise.all([
        api.get<GithubWorkflow[]>(`github-tokens/${tokenId}/workflows?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),
        api.get<GithubBranch[]>(`github-tokens/${tokenId}/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),
      ]);
      setGhWorkflows(workflows); setGhBranches(branches);
      setGhSelectedWorkflow(""); setGhRef(branches[0]?.name ?? "main");
    } catch (e) { setErr(`Fetch workflows failed: ${(e as Error).message}`); }
    setGhLoading(false);
  }, []);

  // Azure fetch handlers
  const fetchAzProjects = useCallback(async (patId: string, org: string) => {
    if (!patId || !org) return;
    setAzLoading(true);
    try {
      const projects = await api.get<AzureProject[]>(`azure-pats/${patId}/projects?organization=${encodeURIComponent(org)}`);
      setAzProjects(projects); setAzSelectedProject(""); setAzPipelines([]);
    } catch (e) { setErr(`Fetch Azure projects failed: ${(e as Error).message}`); }
    setAzLoading(false);
  }, []);

  const fetchAzPipelines = useCallback(async (patId: string, org: string, project: string) => {
    setAzLoading(true);
    try {
      const pipelines = await api.get<AzurePipeline[]>(`azure-pats/${patId}/pipelines?organization=${encodeURIComponent(org)}&project=${encodeURIComponent(project)}`);
      setAzPipelines(pipelines);
    } catch (e) { setErr(`Fetch Azure pipelines failed: ${(e as Error).message}`); }
    setAzLoading(false);
  }, []);

  const buildSchedule = (): JobSchedule | undefined => {
    if (schedulePreset === "custom") {
      const s: JobSchedule = {};
      if (customMinutes !== "") s.minutes = customMinutes.split(",").map(Number).filter((n) => !isNaN(n));
      if (customHours !== "") s.hours = customHours.split(",").map(Number).filter((n) => !isNaN(n));
      if (customMdays !== "") s.mdays = customMdays.split(",").map(Number).filter((n) => !isNaN(n));
      if (customWdays !== "") s.wdays = customWdays.split(",").map(Number).filter((n) => !isNaN(n));
      return s;
    }
    return SCHEDULE_PRESETS[schedulePreset].schedule;
  };

  // GitHub dispatch preset builder (with fetch dropdown data)
  const applyGitHubPreset = () => {
    if (!ghSelectedRepo || !ghSelectedWorkflow) { setErr("Select repo and workflow first."); return; }
    const repoFullName = ghSelectedRepo;
    const [owner, repo] = repoFullName.split("/");
    const wf = ghWorkflows.find((w) => String(w.id) === ghSelectedWorkflow || w.fileName === ghSelectedWorkflow);
    const wfId = wf?.fileName ?? ghSelectedWorkflow;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfId}/dispatches`;
    const hdrs: Record<string, string> = { accept: "application/vnd.github.v3+json" };
    let hdrsJson = "";
    if (!ghTokenId) hdrsJson = JSON.stringify(hdrs, null, 2);
    const payload: Record<string, unknown> = { ref: ghRef || "main" };
    try { const parsed = JSON.parse(ghInputs || "{}"); if (Object.keys(parsed).length > 0) payload.inputs = parsed; } catch {}
    setUrl(apiUrl); setTitle(`[GitHub] ${repo}: ${wfId}`);
    setRequestMethod(1 as RequestMethodValue); setHeadersJson(hdrsJson); setBody(JSON.stringify(payload, null, 2));
    setTab("basic");
  };

  // Azure pipeline preset builder
  const applyAzurePreset = () => {
    if (!azOrganization || !azSelectedProject || !azSelectedPipeline) { setErr("Select organization, project and pipeline first."); return; }
    const pipeline = azPipelines.find((p) => String(p.id) === azSelectedPipeline);
    const apiUrl = `https://dev.azure.com/${azOrganization}/${azSelectedProject}/_apis/pipelines/${azSelectedPipeline}/runs?api-version=7.1`;
    const hdrs: Record<string, string> = { "content-type": "application/json" };
    let hdrsJson = "";
    if (!azPatId) hdrsJson = JSON.stringify(hdrs, null, 2);
    const payload = {};
    setUrl(apiUrl); setTitle(`[Azure] ${azSelectedProject}: ${pipeline?.name ?? azSelectedPipeline}`);
    setRequestMethod(1 as RequestMethodValue); setHeadersJson(hdrsJson); setBody(JSON.stringify(payload, null, 2));
    setTab("basic");
  };

  // cURL export
  const exportCurl = async () => {
    let finalHeadersJson = headersJson;
    let finalBody = body;
    let finalRequestMethod = requestMethod;
    let finalUrl = url;
    if (tab === "gh") {
      const repoFullName = ghSelectedRepo;
      const [owner, repo] = repoFullName.split("/");
      const wf = ghWorkflows.find((w) => String(w.id) === ghSelectedWorkflow || w.fileName === ghSelectedWorkflow);
      const wfId = wf?.fileName ?? ghSelectedWorkflow;
      finalUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfId}/dispatches`;
      finalRequestMethod = 1 as RequestMethodValue;
      const hdrs: Record<string, string> = { accept: "application/vnd.github.v3+json" };
      finalHeadersJson = ghTokenId ? "" : JSON.stringify(hdrs);
      const payload: Record<string, unknown> = { ref: ghRef || "main" };
      try { const p = JSON.parse(ghInputs || "{}"); if (Object.keys(p).length > 0) payload.inputs = p; } catch {}
      finalBody = JSON.stringify(payload);
    } else if (tab === "azure") {
      finalUrl = `https://dev.azure.com/${azOrganization}/${azSelectedProject}/_apis/pipelines/${azSelectedPipeline}/runs?api-version=7.1`;
      finalRequestMethod = 1 as RequestMethodValue;
      finalHeadersJson = azPatId ? "" : JSON.stringify({ "content-type": "application/json" });
      finalBody = "{}";
    }
    let parsedHeaders: Record<string, string> | undefined;
    if (finalHeadersJson.trim()) try { parsedHeaders = JSON.parse(finalHeadersJson); } catch {}
    try {
      const result = await api.post<CurlResult>("curl", {
        url: finalUrl, requestMethod: finalRequestMethod,
        extendedData: parsedHeaders || finalBody ? { headers: parsedHeaders, body: finalBody } : undefined,
      });
      setCurlResult(result);
    } catch (e) { setErr(`cURL export failed: ${(e as Error).message}`); }
  };

  const save = async () => {
    setBusy(true); setErr(null);
    let finalTitle = title, finalUrl = url, finalHeadersJson = headersJson, finalBody = body, finalRequestMethod = requestMethod;
    if (tab === "gh") {
      const repoFullName = ghSelectedRepo; const [owner, repo] = repoFullName.split("/");
      const wf = ghWorkflows.find((w) => String(w.id) === ghSelectedWorkflow || w.fileName === ghSelectedWorkflow);
      const wfId = wf?.fileName ?? ghSelectedWorkflow;
      finalUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfId}/dispatches`;
      finalTitle = `[GitHub] ${repo}: ${wfId}`;
      finalRequestMethod = 1 as RequestMethodValue;
      const hdrs: Record<string, string> = { accept: "application/vnd.github.v3+json" };
      finalHeadersJson = ghTokenId ? "" : JSON.stringify(hdrs);
      const payload: Record<string, unknown> = { ref: ghRef || "main" };
      try { const p = JSON.parse(ghInputs || "{}"); if (Object.keys(p).length > 0) payload.inputs = p; } catch {}
      finalBody = JSON.stringify(payload);
    } else if (tab === "azure") {
      const pipeline = azPipelines.find((p) => String(p.id) === azSelectedPipeline);
      finalUrl = `https://dev.azure.com/${azOrganization}/${azSelectedProject}/_apis/pipelines/${azSelectedPipeline}/runs?api-version=7.1`;
      finalTitle = `[Azure] ${azSelectedProject}: ${pipeline?.name ?? azSelectedPipeline}`;
      finalRequestMethod = 1 as RequestMethodValue;
      finalHeadersJson = azPatId ? "" : JSON.stringify({ "content-type": "application/json" });
      finalBody = "{}";
    }
    let parsedHeaders: Record<string, string> | undefined;
    let parsedBody: string | undefined;
    if (finalHeadersJson.trim()) { try { parsedHeaders = JSON.parse(finalHeadersJson); } catch { setErr("Headers must be valid JSON"); setBusy(false); return; } }
    if (finalBody.trim()) parsedBody = finalBody;
    try {
      await api.post("jobs", {
        accountId, title: finalTitle, url: finalUrl,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        requestMethod: finalRequestMethod, schedule: buildSchedule(),
        extendedData: parsedHeaders || parsedBody ? { headers: parsedHeaders, body: parsedBody } : undefined,
        saveResponses,
        githubTokenId: ghTokenId || undefined,
      });
      setBusy(false); onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title="New Cronjob" onClose={onClose} wide>
      <div className="space-y-3">
        {accounts.length === 0 && <p className="text-error text-body-xs">Add a cronjob account under Resources first.</p>}
        {/* Tab navigation */}
        <div className="flex gap-2 flex-wrap border-b border-outline-variant/20 pb-3">
          <button className={tabCls(tab === "basic")} onClick={() => setTab("basic")}>Basic</button>
          <button className={tabCls(tab === "schedule")} onClick={() => setTab("schedule")}>Schedule</button>
          <button className={tabCls(tab === "headers")} onClick={() => setTab("headers")}>Method & Data</button>
          <button className={tabCls(tab === "gh")} onClick={() => setTab("gh")}>GitHub Dispatch</button>
          <button className={tabCls(tab === "azure")} onClick={() => setTab("azure")}>Azure Pipeline</button>
        </div>

        {/* Tab: Basic */}
        {tab === "basic" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Account</span>
              <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Title</span>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Target URL</span>
              <input className={`${inputCls} font-code`} value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Tags</span>
              <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={saveResponses} onChange={(e) => setSaveResponses(e.target.checked)} className="rounded border-outline-variant/30" />
              <span className="text-body-sm text-on-surface-variant">Save response headers & body</span>
            </label>
          </div>
        )}

        {/* Tab: Schedule */}
        {tab === "schedule" && (
          <div className="space-y-3">
            <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Schedule Preset</span>
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(SCHEDULE_PRESETS) as [SchedulePreset, typeof SCHEDULE_PRESETS[SchedulePreset]][]).map(([key, p]) => (
                <button key={key} className={tabCls(schedulePreset === key)} onClick={() => setSchedulePreset(key)}>{p.label}</button>
              ))}
            </div>
            {schedulePreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <label className="block"><span className="text-label-caps text-on-surface-variant block mb-1">Minutes (0-59)</span><input className={inputCls} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} placeholder="0,15,30,45" /></label>
                <label className="block"><span className="text-label-caps text-on-surface-variant block mb-1">Hours (0-23)</span><input className={inputCls} value={customHours} onChange={(e) => setCustomHours(e.target.value)} placeholder="0,6,12,18" /></label>
                <label className="block"><span className="text-label-caps text-on-surface-variant block mb-1">Days of month</span><input className={inputCls} value={customMdays} onChange={(e) => setCustomMdays(e.target.value)} placeholder="1,15" /></label>
                <label className="block"><span className="text-label-caps text-on-surface-variant block mb-1">Days of week (0=Sun)</span><input className={inputCls} value={customWdays} onChange={(e) => setCustomWdays(e.target.value)} placeholder="1-5" /></label>
              </div>
            )}
            <div className="bg-surface-dim/30 rounded-lg p-2 text-body-xs text-outline font-code">{JSON.stringify(buildSchedule())}</div>
          </div>
        )}

        {/* Tab: Method & Data */}
        {tab === "headers" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Request Method</span>
              <select className={inputCls} value={requestMethod} onChange={(e) => setRequestMethod(Number(e.target.value) as RequestMethodValue)}>
                {(Object.entries(REQUEST_METHODS) as [string, string][]).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Custom Headers (JSON)</span>
              <textarea className={`${inputCls} font-code min-h-[80px]`} value={headersJson} onChange={(e) => setHeadersJson(e.target.value)} placeholder='{"authorization":"Bearer ..."}' />
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Request Body</span>
              <textarea className={`${inputCls} font-code min-h-[100px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Raw request body" />
            </label>
          </div>
        )}

        {/* Tab: GitHub Dispatch — with fetch dropdowns */}
        {tab === "gh" && (
          <div className="space-y-3">
            <p className="text-body-xs text-outline">Select a GitHub token to fetch your repos and workflows. Apply to populate URL, method, headers, and body.</p>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">GitHub Token</span>
              <div className="flex gap-2">
                <select className={inputCls} value={ghTokenId} onChange={(e) => { setGhTokenId(e.target.value); if (e.target.value) fetchGhRepos(e.target.value); }}>
                  <option value="">-- Select token --</option>
                  {githubTokens.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </label>
            {ghTokenId && (
              <label className="block">
                <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Repository {ghLoading && <span className="material-symbols-outlined text-[14px] animate-spin-slow inline">progress_activity</span>}</span>
                <select className={inputCls} value={ghSelectedRepo} onChange={(e) => { setGhSelectedRepo(e.target.value); const [o, r] = e.target.value.split("/"); if (o && r) fetchGhWorkflows(ghTokenId, o, r); }}>
                  <option value="">-- Select repo --</option>
                  {ghRepos.map((r) => <option key={r.id} value={r.fullName}>{r.fullName}{r.private ? " 🔒" : ""}</option>)}
                </select>
              </label>
            )}
            {ghSelectedRepo && ghWorkflows.length > 0 && (
              <label className="block">
                <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Workflow</span>
                <select className={inputCls} value={ghSelectedWorkflow} onChange={(e) => setGhSelectedWorkflow(e.target.value)}>
                  <option value="">-- Select workflow --</option>
                  {ghWorkflows.map((w) => <option key={w.id} value={w.fileName}>{w.name} ({w.fileName})</option>)}
                </select>
              </label>
            )}
            {ghSelectedWorkflow && (
              <>
                <label className="block">
                  <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Git ref</span>
                  <select className={inputCls} value={ghRef} onChange={(e) => setGhRef(e.target.value)}>
                    {ghBranches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                    {!ghBranches.find((b) => b.name === ghRef) && <option value={ghRef}>{ghRef}</option>}
                  </select>
                </label>
                <label className="block">
                  <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Workflow inputs (JSON)</span>
                  <textarea className={`${inputCls} font-code min-h-[80px]`} value={ghInputs} onChange={(e) => setGhInputs(e.target.value)} placeholder='{"environment":"production"}' />
                </label>
              </>
            )}
            <button onClick={applyGitHubPreset} disabled={!ghSelectedRepo || !ghSelectedWorkflow}
              className="w-full py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50">
              Apply GitHub Dispatch Preset
            </button>
          </div>
        )}

        {/* Tab: Azure Pipeline — with fetch dropdowns */}
        {tab === "azure" && (
          <div className="space-y-3">
            <p className="text-body-xs text-outline">Select an Azure PAT to fetch your projects and pipelines. Apply to populate URL, method, headers, and body.</p>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Azure PAT</span>
              <select className={inputCls} value={azPatId} onChange={(e) => { setAzPatId(e.target.value); const pat = azurePats.find((p) => p.id === e.target.value); setAzOrganization((pat?.meta?.organization as string) ?? ""); }}>
                <option value="">-- Select PAT --</option>
                {azurePats.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Organization</span>
              <input className={inputCls} value={azOrganization} onChange={(e) => setAzOrganization(e.target.value)} placeholder="my-org" />
            </label>
            {azPatId && azOrganization && (
              <div className="flex gap-2">
                <button onClick={() => fetchAzProjects(azPatId, azOrganization)} disabled={azLoading}
                  className="px-3 py-1.5 rounded-lg bg-surface-variant text-on-surface-variant text-body-sm border border-outline-variant/30 hover:bg-surface-dim disabled:opacity-50">
                  Fetch Projects {azLoading && <span className="material-symbols-outlined text-[14px] animate-spin-slow inline">progress_activity</span>}
                </button>
              </div>
            )}
            {azProjects.length > 0 && (
              <label className="block">
                <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Project</span>
                <select className={inputCls} value={azSelectedProject} onChange={(e) => { setAzSelectedProject(e.target.value); if (e.target.value) fetchAzPipelines(azPatId, azOrganization, e.target.value); }}>
                  <option value="">-- Select project --</option>
                  {azProjects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </label>
            )}
            {azPipelines.length > 0 && (
              <label className="block">
                <span className="text-label-caps text-on-surface-variant uppercase block mb-1">Pipeline</span>
                <select className={inputCls} value={azSelectedPipeline} onChange={(e) => setAzSelectedPipeline(e.target.value)}>
                  <option value="">-- Select pipeline --</option>
                  {azPipelines.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </label>
            )}
            <button onClick={applyAzurePreset} disabled={!azOrganization || !azSelectedProject || !azSelectedPipeline}
              className="w-full py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50">
              Apply Azure Pipeline Preset
            </button>
          </div>
        )}

        {/* cURL export section */}
        {curlResult && (
          <div className="space-y-2 border-t border-outline-variant/20 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-label-caps text-on-surface-variant uppercase">cURL Command (masked)</span>
              <button onClick={() => navigator.clipboard.writeText(curlResult.masked)} className="text-body-xs text-primary hover:underline">Copy</button>
            </div>
            <pre className="bg-inverse-surface text-inverse-on-surface font-code text-[11px] rounded-lg p-3 overflow-auto max-h-[200px]">{curlResult.masked}</pre>
            <details>
              <summary className="text-body-xs text-error cursor-pointer">⚠️ Show with real secrets (unmasked)</summary>
              <pre className="bg-inverse-surface text-inverse-on-surface font-code text-[11px] rounded-lg p-3 overflow-auto max-h-[200px] mt-1">{curlResult.unmasked}</pre>
              <button onClick={() => navigator.clipboard.writeText(curlResult.unmasked)} className="text-body-xs text-primary hover:underline mt-1">Copy unmasked</button>
            </details>
          </div>
        )}

        {err && <p className="text-error text-body-xs">{err}</p>}
        <div className="flex justify-between gap-2 pt-2 border-t border-outline-variant/20">
          <button onClick={exportCurl} disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm hover:bg-surface-dim flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">terminal</span>Export cURL
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm">Cancel</button>
            <button onClick={save}
              disabled={busy || !accountId || (tab === "gh" ? (!ghSelectedRepo || !ghSelectedWorkflow) : tab === "azure" ? (!azOrganization || !azSelectedProject || !azSelectedPipeline) : (!title || !url))}
              className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50">
              {busy ? "Creating..." : "Create Job"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function JobLogsModal({ job, onClose }: { job: JobMeta; onClose: () => void }) {
  const [logs, setLogs] = useState<JobLog[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<JobLog[]>(`jobs/${job.id}/logs`).then(setLogs).catch((e) => setErr((e as Error).message));
  }, [job.id]);

  return (
    <Modal title={`Execution Log — ${job.title}`} onClose={onClose} wide>
      {err && <p className="text-error text-body-sm">{err}</p>}
      {!logs && !err && <p className="text-outline text-body-sm">Loading…</p>}
      {logs && (
        <div className="bg-inverse-surface rounded-lg p-3 font-code text-[11px] text-inverse-on-surface max-h-[400px] overflow-auto space-y-1">
          {logs.length === 0 && <div className="text-outline">No history yet.</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span className="text-secondary-fixed-dim">{new Date(l.timestamp).toLocaleString()}</span>
              <span className={l.status === "ok" ? "text-primary-fixed-dim" : "text-error-container"}>{l.status.toUpperCase()}</span>
              <span className="text-tertiary-fixed">{l.statusCode ?? ""}</span>
              <span className="truncate">{l.failReason ?? l.responseSnippet ?? `${l.duration ?? 0}ms`}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
