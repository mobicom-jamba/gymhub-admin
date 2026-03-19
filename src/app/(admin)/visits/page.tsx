export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { t } from "@/lib/i18n";
import { Metadata } from "next";
import VisitsSection from "./VisitsSection";

export const metadata: Metadata = {
  title: `Ирц | GymHub Admin`,
  description: "GymHub фитнес төвийн ирц",
};

export default function VisitsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Ирц" />
      <div className="space-y-6">
        <VisitsSection />
      </div>
    </div>
  );
}
