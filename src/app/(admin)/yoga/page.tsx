import { redirect } from "next/navigation";

export default function YogaPage() {
  redirect("/gyms?type=yoga");
}
