"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

export async function updateProject(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const id = formData.get("id") as string;

  const payload = {
    name: (formData.get("name") as string) ?? "",
    project_number: (formData.get("project_number") as string) ?? "",
    address: toNullableString(formData.get("address")),
    lender: toNullableString(formData.get("lender")),
    status: formData.get("status") as string,
  };

  const { error } = await supabase.from("inv_projects").update(payload).eq("id", id);
  if (error) throw error;

  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
}
