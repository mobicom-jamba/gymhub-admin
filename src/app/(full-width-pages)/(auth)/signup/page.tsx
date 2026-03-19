import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Бүртгүүлэх | GymHub Admin",
  description: "GymHub админ бүртгэл",
};

export default function SignUp() {
  return <SignUpForm />;
}
