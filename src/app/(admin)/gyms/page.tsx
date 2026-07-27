export const dynamic = "force-dynamic";
import { Suspense } from "react";
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
        <Suspense
          fallback={
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">
              {t("loading")}
            </div>
          }
        >
          <GymsSection />
        </Suspense>
      </div>
    </div>
  );
}
