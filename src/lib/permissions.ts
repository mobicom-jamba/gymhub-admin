export type AppRole = "admin" | "moderator" | "sales" | "gym_owner" | "org_admin" | "user";

export type AppPermission =
  | "admin.app.access"
  | "users.view"
  | "users.manage"
  | "users.password.reset"
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
  | "commissions.rate.approve"
  | "coupons.manage"
  | "payments.installments.view"
  | "org.admins.manage"
  | "org.portal.access"
  | "org.members.view"
  | "org.reports.export";

const ALL_PERMISSIONS: AppPermission[] = [
  "admin.app.access",
  "users.view",
  "users.manage",
  "users.password.reset",
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
  "coupons.manage",
  "payments.installments.view",
  "org.admins.manage",
  "org.portal.access",
  "org.members.view",
  "org.reports.export",
];

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: ALL_PERMISSIONS,
  // Moderators: view-only for users + organizations, but can reset password.
  moderator: ALL_PERMISSIONS.filter(
    (permission) =>
      permission !== "users.manage" &&
      permission !== "users.role.assign" &&
      permission !== "users.subscription.edit" &&
      permission !== "organizations.create" &&
      permission !== "org.admins.manage",
  ),
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
  // HR: зөвхөн өөрийн байгууллагын портал. Админ вэб апп руу орох эрхгүй.
  org_admin: ["org.portal.access", "org.members.view", "org.reports.export"],
  user: [],
};

export function normalizeAppRole(raw: string | null | undefined): AppRole {
  const role = (raw ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "moderator") return "moderator";
  if (role === "sales") return "sales";
  if (role === "gym_owner") return "gym_owner";
  if (role === "org_admin") return "org_admin";
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
