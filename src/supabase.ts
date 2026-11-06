import { createClient } from "@supabase/supabase-js";
import { takeGoogleReturn } from "./data/googleLogin";

// Read before the client starts, so neither Supabase nor the page links see Google's answer in the address.
export const googleReturn = takeGoogleReturn();

// Publishable browser credentials. Row-level security protects the data rows.
export const supabase = createClient(
  "https://ghpiixyzxeqvdkwostcb.supabase.co",
  "sb_publishable_dbXp4bFaIdFgjjKP6vUsOg_kd9Ss5g3"
);
