function readBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const featureFlags = {
  enhancedAnalyticsCharts: readBool(process.env.NEXT_PUBLIC_FEATURE_ENHANCED_ANALYTICS, true),
  commissionApprovalWorkflow: readBool(process.env.NEXT_PUBLIC_FEATURE_COMMISSION_APPROVAL, true),
};
