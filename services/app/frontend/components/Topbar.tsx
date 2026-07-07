"use client";

import { useEffect, useState } from "react";

export function Topbar({ title }: { title: string }) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/health-check", { cache: "no-store" }).catch(() => null);
        if (alive) setOnline(Boolean(r?.ok));
      } catch {
        if (alive) setOnline(false);
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="flex justify-between items-center h-row-height-md px-container-padding bg-background border-b border-outline-variant/20 z-10 w-full shrink-0">
      <div className="flex items-center gap-4 flex-1">
        <h1 className="text-h2 text-on-background">{title}</h1>
        <div className="hidden md:flex relative max-w-xs w-full ml-2">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
            search
          </span>
          <input
            className="w-full bg-surface-container-highest border border-outline-variant/20 text-on-background text-body-sm rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Search resources, jobs..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span
          className={`hidden lg:flex items-center gap-2 text-body-xs px-2 py-1 rounded-full ${
            online === false
              ? "text-error bg-error/10"
              : "text-primary-fixed-dim bg-primary-fixed/10"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              online === false ? "bg-error" : "bg-emerald-500"
            }`}
          />
          {online === false ? "Backend offline" : "Connection: Active"}
        </span>
        <button className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-highest transition-colors">
          <span className="material-symbols-outlined text-[20px]">account_tree</span>
        </button>
        <button className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-highest transition-colors relative">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border border-background" />
        </button>
        <div className="h-6 w-px bg-outline-variant/30" />
        <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-body-xs font-semibold">
          OP
        </div>
      </div>
    </header>
  );
}
