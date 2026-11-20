import { useId, useRef, type ReactNode } from 'react';
import { ArrowRight, Info, X } from 'lucide-react';

export function Dialog({ title, dialogRef, children, wide = false }: {
  title: string;
  dialogRef: React.RefObject<HTMLDialogElement>;
  children: ReactNode;
  wide?: boolean;
}) {
  const headingId = useId();
  return (
    <dialog className={wide ? 'explain-dialog dialog-wide' : 'explain-dialog'} ref={dialogRef} aria-labelledby={headingId}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="dialog-inner">
        <header className="dialog-heading">
          <h2 id={headingId}>{title}</h2>
          <button type="button" className="icon-control" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function Flow({ steps }: { steps: string[] }) {
  return (
    <ol className="concept-flow">
      {steps.map((step, index) => (
        <li key={step}>
          {index > 0 && <ArrowRight size={15} aria-hidden="true" />}
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function ConceptInfo({ title, steps, children, source }: {
  title: string;
  steps: string[];
  children: ReactNode;
  source?: { title: string; url: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="icon-control concept-info" aria-label={`About ${title}`}
        title={`About ${title}`} onClick={() => dialog.current?.showModal()}>
        <Info size={17} />
      </button>
      <Dialog title={title} dialogRef={dialog}>
        <Flow steps={steps} />
        <div className="concept-copy">{children}</div>
        {source && <a className="concept-source" href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>}
      </Dialog>
    </>
  );
}

