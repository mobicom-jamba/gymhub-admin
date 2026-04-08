# Multi-Role Rollout Guide

This release adds role-aware permissions, sales commission approval workflow, avatar visibility for fitness staff, map rendering improvements, and expanded analytics.

## Feature Flags (phase-gated rollout)

### `gymhub-admin` flags

- `NEXT_PUBLIC_FEATURE_ENHANCED_ANALYTICS`
  - `true`: show new monthly visits and commissions charts in admin dashboard.
  - `false`: hide the new chart cards.
- `NEXT_PUBLIC_FEATURE_COMMISSION_APPROVAL`
  - `true`: show pending commission request approval panel in admin sales promo card.
  - `false`: hide approval UI while preserving API behavior.

### `gymhub.mn` flags

- `VITE_FEATURE_SALES_COMMISSION_WORKFLOW`
  - `true`: show sales commission request submit/history UI.
  - `false`: hide commission request workflow in sales pages.
- `VITE_FEATURE_FITNESS_MAP_EMBED`
  - `true`: show OpenStreetMap embedded map in Fitness section.
  - `false`: keep list-only experience.

## Recommended rollout sequence

1. Run DB migration scripts:
   - `sql/sales_role.sql`
   - `sql/sales_commission_requests.sql`
2. Deploy backend and keep all new flags `false` in production.
3. Enable `NEXT_PUBLIC_FEATURE_COMMISSION_APPROVAL=true` for internal admin testing.
4. Enable `VITE_FEATURE_SALES_COMMISSION_WORKFLOW=true` for internal sales testers.
5. Enable `VITE_FEATURE_FITNESS_MAP_EMBED=true` for a small user cohort.
6. Enable `NEXT_PUBLIC_FEATURE_ENHANCED_ANALYTICS=true` after metrics validation.

## Test checklist (manual + API)

- Auth/permissions
  - Admin can access `/users`, change roles, and change subscription dates.
  - Moderator can access dashboard/analytics but cannot change subscription dates.
  - Sales can access sales routes and cannot perform admin-only actions.
- Sales commissions
  - Sales submits a commission request (`/api/sales/commission-requests`).
  - Admin approves/rejects request (`/api/admin/commission-requests/:id`).
  - Active promo `commission_rate` updates on approve.
- Users/avatars
  - User uploads avatar through `/api/me/avatar`.
  - Gym owner requests/history now show user photo if uploaded.
- Map
  - Fitness page renders map iframe when coordinates exist.
  - Gym chips switch selected map location.
- Analytics
  - `/api/admin/dashboard-analytics` returns `visitsByMonth` and `commissionsByMonth`.
  - Dashboard renders both charts when analytics flag is enabled.
