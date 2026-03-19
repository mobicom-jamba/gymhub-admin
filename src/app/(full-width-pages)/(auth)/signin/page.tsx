import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Нэвтрэх | GymHub Admin",
  description: "GymHub админ нэвтрэх",
};

export default function SignIn() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Уншиж байна...
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
