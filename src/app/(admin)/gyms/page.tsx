export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { t } from "@/lib/i18n";
import { Metadata } from "next";
import GymsSection from "./GymsSection";

export const metadata: Metadata = {
  title: `${t("gyms")} | GymHub Admin`,
  description: "GymHub фитнес төвүүдийн удирдлага",
};

export default function GymsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle={t("gyms")} />
      <div className="space-y-6">
        <GymsSection />
      </div>
    </div>
  );
}
