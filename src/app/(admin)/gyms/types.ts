export type Gym = {
  id: string;
  name?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  opening_hours?: unknown;
  amenities?: string[] | null;
  is_active?: boolean | null;
  /** Max check-ins per local day (UTC+8); null = unlimited */
  daily_visitor_limit?: number | null;
  created_at?: string;
  type?: string | null;  
};
