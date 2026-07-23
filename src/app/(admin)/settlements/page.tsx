import SettlementsSection from "./SettlementsSection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Тооцоо | GymHub Admin",
  description: "Фитнес түншийн сарын тооцоо",
};

export default function SettlementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Тооцоо</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Фитнес төвүүдийн сарын оролт х үнэ. Өмнөх саруудыг хараад дүнг засварлана.
        </p>
      </div>
      <SettlementsSection />
    </div>
  );
}
