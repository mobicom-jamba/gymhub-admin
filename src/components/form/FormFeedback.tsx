"use client";

import React from "react";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </div>
  );
}

export function SubmitLabel({
  loading,
  loadingText = "Түр хүлээнэ үү...",
  idleText,
}: {
  loading: boolean;
  loadingText?: string;
  idleText: string;
}) {
  return <>{loading ? loadingText : idleText}</>;
}

