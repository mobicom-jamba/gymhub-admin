/** Gyms.city-тай ижил түлхүүр: ulaanbaatar | darkhan (орон нутаг / бүсчлэл). */
export type SignupRegion = "ulaanbaatar" | "darkhan";

export const SIGNUP_REGION_OPTIONS: { id: SignupRegion; label: string; hint: string }[] = [
  { id: "ulaanbaatar", label: "Улаанбаатар", hint: "Нийслэлийн фитнесүүд" },
  { id: "darkhan", label: "Орон нутаг", hint: "Бүсчлэл / орон нутгийн фитнес" },
];

export function parseSignupRegion(raw: unknown): SignupRegion | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "ulaanbaatar" || v === "ub" || v === "улаанбаатар") return "ulaanbaatar";
  if (
    v === "darkhan" ||
    v === "regional" ||
    v === "province" ||
    v === "орон нутаг" ||
    v === "бүсчлэл"
  ) {
    return "darkhan";
  }
  return null;
}

export function signupRegionLabel(region: string | null | undefined): string {
  const parsed = parseSignupRegion(region);
  if (parsed === "darkhan") return "Орон нутаг";
  if (parsed === "ulaanbaatar") return "Улаанбаатар";
  return "—";
}
