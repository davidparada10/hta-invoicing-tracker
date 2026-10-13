import { previewProjectClose } from "@/app/projects/actions";
import { closeNoticeMessage } from "@/lib/portfolio";

// Shared by the quick status control and the Edit Project form. Returns true
// when closing may proceed: nothing owed or held, or the user confirmed after
// seeing the exact amounts. If the balances can't be checked, closing is
// blocked rather than silently skipping the notice.
export async function confirmCloseProject(projectId: string, projectName: string): Promise<boolean> {
  let message: string | null;
  try {
    message = closeNoticeMessage(projectName, await previewProjectClose(projectId));
  } catch {
    alert("Could not check this project's open balances, so it wasn't closed. Please try again.");
    return false;
  }
  return message === null ? true : confirm(message);
}
