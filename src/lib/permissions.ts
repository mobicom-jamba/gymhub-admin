export type AppRole = "admin" | "moderator" | "sales" | "gym_owner" | "user";

export type AppPermission =
  | "admin.app.access"
  | "users.view"
  | "users.manage"
  | "users.role.assign"
  | "users.subscription.edit"
  | "organizations.view"
  | "organizations.create"
  | "gyms.view"
  | "gyms.map.view"
  | "fitness.activity.view"
  | "analytics.view"
  | "moderator.grant"
  | "commissions.view.own"
  | "commissions.view.all"
  | "commissions.rate.request"
  | "commissions.rate.approve";

const ALL_PERMISSIONS: AppPermission[] = [
  "admin.app.access",
  "users.view",
  "users.manage",
  "users.role.assign",
  "users.subscription.edit",
  "organizations.view",
  "organizations.create",
  "gyms.view",
  "gyms.map.view",
  "fitness.activity.view",
  "analytics.view",
  "moderator.grant",
  "commissions.view.own",
  "commissions.view.all",
  "commissions.rate.request",
  "commissions.rate.approve",
];

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: ALL_PERMISSIONS,
  moderator: ALL_PERMISSIONS.filter((permission) => permission !== "users.subscription.edit"),
  sales: [
    "admin.app.access",
    "users.view",
    "organizations.view",
    "organizations.create",
    "gyms.view",
    "gyms.map.view",
    "commissions.view.own",
    "commissions.rate.request",
  ],
  gym_owner: ["fitness.activity.view", "gyms.view"],
  user: [],
};

export function normalizeAppRole(raw: string | null | undefined): AppRole {
  const role = (raw ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "moderator") return "moderator";
  if (role === "sales") return "sales";
  if (role === "gym_owner") return "gym_owner";
  return "user";
}

export function getPermissionsForRole(role: AppRole): AppPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  permissions: readonly AppPermission[] | null | undefined,
  permission: AppPermission,
): boolean {
  return (permissions ?? []).includes(permission);
}
