import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Хоосон хуудас | GymHub Admin",
  description: "Хоосон хуудас",
};

export default function BlankPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Хоосон хуудас" />
      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mx-auto w-full max-w-[630px] text-center">
          <h3 className="mb-4 font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">
            Гарчиг энд
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Энд контентоо оруулна уу. Хүснэгт, самбар, эсвэл өөр төрлийн layout
            ашиглаж болно.
          </p>
        </div>
      </div>
    </div>
  );
}
