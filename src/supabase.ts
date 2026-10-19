import { createClient } from "@supabase/supabase-js";

// Publishable browser credentials. Row-level security protects the data rows.
export const supabase = createClient(
  "https://ghpiixyzxeqvdkwostcb.supabase.co",
  "sb_publishable_dbXp4bFaIdFgjjKP6vUsOg_kd9Ss5g3"
);
