import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import NotificationsSection from "./NotificationsSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Push мэдэгдэл | GymHub Admin",
  description: "Апп хэрэглэгчид рүү push илгээх",
};

export default function NotificationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Push мэдэгдэл" />
      <div className="space-y-6">
        <NotificationsSection />
      </div>
    </div>
  );
}
