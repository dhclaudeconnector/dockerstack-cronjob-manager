"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/resources", label: "Resources", icon: "inventory_2" },
  { href: "/cronjobs", label: "Cronjobs", icon: "schedule" },
  { href: "/executor", label: "Executor", icon: "terminal" },
  { href: "/logs", label: "Logs", icon: "list_alt" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed left-0 top-0 h-full w-[240px] bg-inverse-surface border-r border-outline-variant/10 hidden md:flex flex-col py-gutter px-unit z-20">
      <div className="px-3 py-4 mb-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container">
          <span className="material-symbols-outlined text-[18px] filled">schedule</span>
        </div>
        <div>
          <h1 className="text-h2 text-primary-fixed tracking-tight">CronOps Pro</h1>
          <p className="text-body-xs text-outline">V2.4.1-Stable</p>
        </div>
      </div>

      <div className="px-3 mb-5">
        <Link
          href="/cronjobs?new=1"
          className="w-full bg-primary hover:bg-primary-container text-on-primary text-body-sm py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New Job
        </Link>
      </div>

      <ul className="flex-1 space-y-1">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 ${
                  active
                    ? "bg-on-secondary-fixed-variant text-primary-fixed-dim font-semibold"
                    : "text-on-secondary-fixed-variant hover:text-primary-fixed-dim hover:bg-on-secondary-fixed-variant/50"
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${active ? "filled" : ""}`}>
                  {item.icon}
                </span>
                <span className="text-body-sm">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-outline-variant/10 pt-4 space-y-1">
        <a
          href="https://api.cron-job.org"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-on-secondary-fixed-variant hover:text-primary-fixed-dim hover:bg-on-secondary-fixed-variant/50 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">menu_book</span>
          <span className="text-body-xs">Documentation</span>
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-on-secondary-fixed-variant hover:text-primary-fixed-dim hover:bg-on-secondary-fixed-variant/50 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">support_agent</span>
          <span className="text-body-xs">Support</span>
        </a>
      </div>
    </nav>
  );
}
