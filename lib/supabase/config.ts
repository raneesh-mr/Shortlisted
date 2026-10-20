export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Lets the app run in guest-only mode (e.g. local dev) before Supabase is set up. */
export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
