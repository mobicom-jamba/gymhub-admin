"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";
import { t } from "@/lib/i18n";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isChecked) {
      setError("Үйлчилгээний нөхцөлийг зөвшөөрнө үү.");
      return;
    }

    if (!fname.trim() || !lname.trim()) {
      setError("Нэр болон овгоо оруулна уу.");
      return;
    }

    if (password.length < 6) {
      setError("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: `${fname.trim()} ${lname.trim()}`,
          role: "admin",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Бүртгэл амжилтгүй боллоо.");
        setLoading(false);
        return;
      }

      // Auto sign-in after successful registration
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setSuccess("Бүртгэл амжилттай! Нэвтрэх хуудас руу шилжинэ үү.");
        setLoading(false);
        return;
      }

      // Redirect to dashboard
      window.location.href = "/";
    } catch {
      setError("Сервертэй холбогдоход алдаа гарлаа.");
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
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
              Бүртгүүлэх
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Имэйл болон нууц үгээ оруулаад бүртгүүлнэ үү.
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                {error && (
                  <div className="p-3 rounded-lg bg-error-50 text-error-600 text-sm dark:bg-error-950 dark:text-error-400">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-3 rounded-lg bg-success-50 text-success-600 text-sm dark:bg-success-950 dark:text-success-400">
                    {success}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* <!-- First Name --> */}
                  <div className="sm:col-span-1">
                    <Label>
                      Нэр<span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="fname"
                      name="fname"
                      placeholder="Нэрээ оруулна уу"
                      required
                      value={fname}
                      onChange={(e) => setFname(e.target.value)}
                    />
                  </div>
                  {/* <!-- Last Name --> */}
                  <div className="sm:col-span-1">
                    <Label>
                      Овог<span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="lname"
                      name="lname"
                      placeholder="Овгоо оруулна уу"
                      required
                      value={lname}
                      onChange={(e) => setLname(e.target.value)}
                    />
                  </div>
                </div>
                {/* <!-- Email --> */}
                <div>
                  <Label>
                    Имэйл<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Имэйлээ оруулна уу"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {/* <!-- Password --> */}
                <div>
                  <Label>
                    Нууц үг<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="Нууц үгээ оруулна уу"
                      type={showPassword ? "text" : "password"}
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
                {/* <!-- Checkbox --> */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    className="w-5 h-5"
                    checked={isChecked}
                    onChange={setIsChecked}
                  />
                  <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                    Бүртгэл үүсгэснээр та{" "}
                    <span className="text-gray-800 dark:text-white/90">
                      Үйлчилгээний нөхцөл,
                    </span>{" "}
                    мөн{" "}
                    <span className="text-gray-800 dark:text-white">
                      Нууцлалын бодлого
                    </span>
                    -ыг зөвшөөрсөнд тооцно.
                  </p>
                </div>
                {/* <!-- Button --> */}
                <div>
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Бүртгэж байна..." : "Бүртгүүлэх"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Аль хэдийн бүртгэлтэй юу?
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Нэвтрэх
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
