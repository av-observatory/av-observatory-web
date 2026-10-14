/** Marks policy entries added by the automated refresh and not yet reviewed by a maintainer. */
export function AutoCollectedNote({ entry }: { entry: object }) {
  if ((entry as { review_status?: string }).review_status !== "auto_collected") return null;
  return (
    <span className="inline-block mt-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
      Auto-collected from the official source · not yet reviewed
    </span>
  );
}
