import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CronOps Pro — Cronjob Multi-Account Manager",
  description: "Manage cronjob.org accounts, tokens, jobs and executor queue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-on-background text-body-sm antialiased h-screen flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col md:ml-[240px] h-full overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
