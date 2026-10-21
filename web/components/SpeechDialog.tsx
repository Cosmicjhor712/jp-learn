import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function SpeechDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="speech-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="speech-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
