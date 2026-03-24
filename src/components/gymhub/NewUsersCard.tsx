"use client";

import React from "react";

type UserRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  company?: string | null;
  created_at: string;
};

const colors = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-500 to-green-600",
  "from-red-500 to-pink-600",
  "from-sky-500 to-blue-600",
];

export default function NewUsersCard({ users, onEdit }: { users: UserRow[]; onEdit?: (id: string) => void }) {
  if (users.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Шинээр бүртгэгдсэн хэрэглэгч байхгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {users.map((u, i) => (
        <div
          key={u.id}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colors[i % colors.length]} text-white text-xs font-bold`}>
            {(u.full_name ?? "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-white/90 text-sm truncate">
              {u.full_name ?? "—"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {u.company ?? "—"} · {new Date(u.created_at).toLocaleDateString("mn-MN")}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-mono font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {u.phone ?? "—"}
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(u.id)}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
              title="Засах"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4.5 1.125 1.125-4.5L16.862 3.487z" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
