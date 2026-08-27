import { DrawStatus } from "@/lib/types";
import { STATUS_STYLES } from "@/lib/badgeTone";

export { STATUS_STYLES };

export default function StatusBadge({ status }: { status: DrawStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}
