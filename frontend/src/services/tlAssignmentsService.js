import { supabase } from "./supabaseClient";

export async function getAssignedRecruitersForTL(tlUserId) {
  if (!tlUserId) return [];

  const { data: assignments, error } = await supabase
    .from("tl_recruiter_assignments")
    .select("recruiter_id")
    .eq("tl_id", tlUserId);

  if (error) {
    console.error("[tl_assignments] fetch failed", error);
    return [];
  }

  const recruiterIds = Array.from(
    new Set((assignments || []).map((row) => row.recruiter_id).filter(Boolean))
  );
  if (recruiterIds.length === 0) return [];

  const { data: recruiters, error: recruitersError } = await supabase
    .from("users")
    .select("id,name,email")
    .in("id", recruiterIds)
    .order("name", { ascending: true });

  if (recruitersError) {
    console.error("[tl_assignments] recruiter lookup failed", recruitersError);
    return [];
  }

  return recruiters || [];
}

