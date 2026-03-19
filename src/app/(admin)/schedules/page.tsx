export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { t } from "@/lib/i18n";
import { Metadata } from "next";
import SchedulesSection from "./SchedulesSection";

export const metadata: Metadata = {
  title: `${t("schedules")} | GymHub Admin`,
  description: "GymHub хичээлийн цагийн хуваарь",
};

export default function SchedulesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle={t("schedules")} />
      <div className="space-y-6">
        <SchedulesSection />
      </div>
    </div>
  );
}
