export function Settings({ onClose }: { onClose(): void }) {
  return (
    <div className="p-7">
      <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
        닫기
      </button>
    </div>
  );
}
