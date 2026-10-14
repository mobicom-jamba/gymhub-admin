"use client";

import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/modal";
import type { Gym } from "./types";

export default function GymQRModal({
  gym,
  onClose,
  doorCode = "",
  onSaveDoorCode,
}: {
  gym: Gym | null;
  onClose: () => void;
  /** Одоогийн хаалганы код ("" = тохируулаагүй) */
  doorCode?: string;
  /** "" дамжуулбал кодыг устгана */
  onSaveDoorCode?: (gym: Gym, code: string) => Promise<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [codeDraft, setCodeDraft] = useState(doorCode);
  const [savingCode, setSavingCode] = useState(false);

  const saveCode = async (code: string) => {
    if (!gym || !onSaveDoorCode) return;
    setSavingCode(true);
    await onSaveDoorCode(gym, code);
    setSavingCode(false);
  };

  useEffect(() => {
    if (!gym || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `gymhub:checkin:${gym.id}`, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#1e1b4b", light: "#ffffff" },
    });
  }, [gym]);

  const handlePrint = () => {
    if (!canvasRef.current || !gym) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>${gym.name ?? "QR"} — Check-in</title>
      <style>
        body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #f8f8f8; }
        .card { background: white; border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        h2 { margin: 0 0 4px; font-size: 18px; color: #1e1b4b; }
        p { margin: 0 0 20px; font-size: 13px; color: #6b7280; }
        img { display: block; margin: 0 auto 16px; border-radius: 8px; }
        .hint { font-size: 12px; color: #9ca3af; }
        .brand { margin-top: 16px; font-size: 13px; font-weight: 700; color: #4f46e5; letter-spacing: 0.05em; }
        @media print { body { background: white; } .card { box-shadow: none; } }
      </style></head>
      <body><div class="card">
        <h2>${gym.name ?? ""}</h2>
        ${gym.address ? `<p>${gym.address}</p>` : "<p>&nbsp;</p>"}
        <img src="${dataUrl}" width="240" height="240" />
        <div class="hint">GymHub аппаар уншуулж ирцээ бүртгүүлнэ</div>
        <div class="brand">GymHub</div>
      </div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <Modal isOpen={!!gym} onClose={onClose} className="mx-4 max-w-xs">
      <div className="space-y-5 p-6 pt-8 text-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">
            {gym?.name ?? ""}
          </h2>
          {gym?.address && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {gym.address}
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/[0.06] dark:bg-gray-800">
            <canvas ref={canvasRef} />
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          GymHub аппаар уншуулж ирцээ бүртгүүлнэ
        </p>

        <button
          type="button"
          onClick={handlePrint}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          Хэвлэх
        </button>

        {onSaveDoorCode && (
          <div className="space-y-2 border-t border-gray-100 pt-4 text-left dark:border-white/[0.06]">
            <label
              htmlFor="gym-door-code"
              className="block text-sm font-semibold text-gray-700 dark:text-gray-300"
            >
              Хаалганы код
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Ажилтангүй фитнест QR уншуулсны дараа хэрэглэгчид энэ код харагдана.
              Хоосон бол код харуулахгүй.
            </p>
            <div className="flex gap-2">
              <input
                id="gym-door-code"
                type="text"
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                placeholder="Жишээ: 1234#"
                maxLength={32}
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm font-semibold tracking-widest text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
              />
              <button
                type="button"
                disabled={savingCode || codeDraft.trim() === doorCode}
                onClick={() => saveCode(codeDraft)}
                className="rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                Хадгалах
              </button>
            </div>
            {doorCode && (
              <button
                type="button"
                disabled={savingCode}
                onClick={() => saveCode("")}
                className="text-xs font-medium text-error-600 hover:underline disabled:opacity-50 dark:text-error-400"
              >
                Кодыг устгах
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
