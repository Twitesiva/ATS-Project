// src/services/supabaseClient.js

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client — for password updates only
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);