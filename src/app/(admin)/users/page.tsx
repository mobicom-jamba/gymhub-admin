export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { t } from "@/lib/i18n";
import { Metadata } from "next";
import UsersSection from "./UsersSection";

export const metadata: Metadata = {
  title: `${t("users")} | GymHub Admin`,
  description: "GymHub хэрэглэгчдийн удирдлага",
};

export default function UsersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle={t("users")} />
      <div className="space-y-6">
        <UsersSection />
      </div>
    </div>
  );
}
