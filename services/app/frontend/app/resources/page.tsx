"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Tag } from "@/components/ui";
import { api, type Resource } from "@/lib/api";

const TABS = [
  { key: "accounts", label: "Cronjob Accounts", icon: "group" },
  { key: "github-tokens", label: "GitHub Tokens", icon: "code" },
  { key: "azure-pats", label: "Azure PATs", icon: "cloud" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ResourcesPage() {
  const [tab, setTab] = useState<TabKey>("accounts");
  const [items, setItems] = useState<Resource[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  const load = async () => {
    try {
      const list = await api.get<Resource[]>(`${tab}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setItems(list);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this resource?")) return;
    await api.del(`${tab}/${id}`);
    load();
  };

  const exportUrl = `/proxy/${tab}/batch-export?format=csv`;

  return (
    <>
      <Topbar title="Resources" />
      <main className="flex-1 overflow-auto p-container-padding">
        <div className="max-w-[1600px] mx-auto space-y-gutter">
          {/* Header + tabs */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 py-2">
            <div className="flex items-center gap-1 bg-surface-container rounded-lg p-1 border border-outline-variant/20">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-body-sm transition-colors ${
                    tab === t.key
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                  search
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search label..."
                  className="pl-8 pr-3 h-8 bg-surface-container-highest border border-outline-variant/20 rounded-lg text-body-sm w-48 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <a
                href={exportUrl}
                className="h-8 px-3 bg-surface-variant rounded-lg text-body-sm border border-outline-variant/20 hover:bg-surface-dim transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Export
              </a>
              <button
                onClick={() => setShowImport(true)}
                className="h-8 px-3 bg-surface-variant rounded-lg text-body-sm border border-outline-variant/20 hover:bg-surface-dim transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">upload</span>
                Import
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                className="h-8 px-3 bg-primary text-on-primary rounded-lg text-body-sm hover:bg-primary-container transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New
              </button>
            </div>
          </div>

          {err && (
            <div className="bg-error-container/40 border border-error/30 text-on-error-container rounded-lg px-4 py-2 text-body-sm">
              {err}
            </div>
          )}

          {/* Table */}
          <div className="bg-surface border border-outline-variant/20 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                  {["Label", "Secret", "Tags", "Project", "Updated", "Actions"].map((h) => (
                    <th key={h} className="py-2 px-3 text-label-caps text-outline">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-body-sm">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-outline">
                      No {TABS.find((t) => t.key === tab)?.label}. Click “New” or “Import”.
                    </td>
                  </tr>
                )}
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors h-row-height-sm group"
                  >
                    <td className="py-1 px-3 font-semibold text-on-surface">{r.label}</td>
                    <td className="py-1 px-3 font-code text-code text-on-surface-variant">{r.secret}</td>
                    <td className="py-1 px-3">
                      <div className="flex gap-1 flex-wrap">
                        {(r.tags ?? []).map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    </td>
                    <td className="py-1 px-3 text-on-surface-variant">{r.project ?? "--"}</td>
                    <td className="py-1 px-3 font-code text-code text-outline">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="py-1 px-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditing(r);
                            setShowForm(true);
                          }}
                          className="text-outline hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          className="text-outline hover:text-error transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showForm && (
        <ResourceForm
          tab={tab}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {showImport && (
        <ImportModal
          tab={tab}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
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

function ResourceForm({
  tab,
  editing,
  onClose,
  onSaved,
}: {
  tab: TabKey;
  editing: Resource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [secret, setSecret] = useState("");
  const [tags, setTags] = useState((editing?.tags ?? []).join(", "));
  const [project, setProject] = useState(editing?.project ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const payload: any = {
        label,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        project: project || undefined,
      };
      if (secret) payload.secret = secret;
      if (editing) {
        await api.patch(`${tab}/${editing.id}`, payload);
      } else {
        if (!secret) throw new Error("Secret is required");
        await api.post(tab, payload);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Resource" : "New Resource"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Label">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label={editing ? "Secret (leave blank to keep)" : "Secret / Token / PAT"}>
          <input
            className={`${inputCls} font-code`}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={editing ? editing.secret : ""}
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Project">
          <input className={inputCls} value={project} onChange={(e) => setProject(e.target.value)} />
        </Field>
        {err && <p className="text-error text-body-xs">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ tab, onClose, onDone }: { tab: TabKey; onClose: () => void; onDone: () => void }) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [data, setData] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<any>(`${tab}/batch-import`, { format, data });
      setResult(res);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Batch Import" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["json", "csv"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-3 py-1 rounded text-body-sm ${
                format === f ? "bg-primary text-on-primary" : "bg-surface-container border border-outline-variant/20"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <textarea
          className={`${inputCls} font-code h-40`}
          placeholder={
            format === "json"
              ? '[{"label":"acct-1","secret":"KEY","tags":["prod"]}]'
              : "label,secret,tags,project\nacct-1,KEY,prod;core,proj-a"
          }
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
        {err && <p className="text-error text-body-xs">{err}</p>}
        {result && (
          <div className="text-body-xs bg-surface-container rounded-lg p-2">
            Imported {result.imported}/{result.total}.{" "}
            {result.errors?.length > 0 && (
              <span className="text-error">{result.errors.length} row errors.</span>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm">
            Close
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-body-sm disabled:opacity-50"
          >
            {busy ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const inputCls =
  "w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-body-sm text-on-surface focus:ring-2 focus:ring-primary outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-label-caps text-on-surface-variant uppercase block mb-1">{label}</span>
      {children}
    </label>
  );
}
