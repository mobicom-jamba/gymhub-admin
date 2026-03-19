export type Gym = {
  id: string;
  name?: string | null;
  description?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  opening_hours?: unknown;
  amenities?: string[] | null;
  is_active?: boolean | null;
  created_at?: string;
};
