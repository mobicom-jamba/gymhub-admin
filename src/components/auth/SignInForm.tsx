"use client";

import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { t } from "@/lib/i18n";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { isStaffRoleForAdminApp, resolveSignInEmailOrPhone } from "@/lib/admin-app-access";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const errorParam = searchParams.get("error");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const emailForAuth = resolveSignInEmailOrPhone(loginId);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailForAuth,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (!isStaffRoleForAdminApp(profile?.role)) {
        await supabase.auth.signOut();
        setError("Зөвхөн админ, модератор эсвэл борлуулалтын эрхтэй хэрэглэгчид нэвтрэх боломжтой.");
        return;
      }
      router.push(redirect);
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          {t('backToDashboard')}
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Нэвтрэх
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Имэйл эсвэл утасны дугаар, мөн нууц үг оруулна уу. Утасны хувьд бүртгэлтэй 8–15 оронтой дугаар.
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {(error || errorParam === "unauthorized") && (
                  <div className="p-3 rounded-lg bg-error-50 text-error-600 text-sm dark:bg-error-950 dark:text-error-400">
                    {errorParam === "unauthorized"
                      ? "Зөвхөн админ, модератор эсвэл борлуулалтын эрхтэй хэрэглэгчид нэвтрэх боломжтой."
                      : errorParam === "auth"
                      ? "Нэвтрэх боломжгүй боллоо."
                      : error}
                  </div>
                )}
                <div>
                  <Label>
                    Имэйл эсвэл утас <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input
                    placeholder="admin@company.com эсвэл 99112233"
                    type="text"
                    required
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    Нууц үг <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Нууц үгээ оруулна уу"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      Намайг сануулах
                    </span>
                  </div>
                </div>
                <div>
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Нэвтэрч байна..." : "Нэвтрэх"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Бүртгэлгүй юу? {""}
                <Link
                  href="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Бүртгүүлэх
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
