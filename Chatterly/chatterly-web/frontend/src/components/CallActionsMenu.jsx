import { useEffect, useId, useRef, useState } from 'react';

export default function CallActionsMenu({ label, className, buttonClassName, actions }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={className} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span className="text-[12px] leading-none" aria-hidden="true">...</span>
      </button>
      {isOpen ? (
        <div ref={menuRef} id={menuId} role="menu" aria-label={label}
          className="absolute right-0 top-full z-30 mt-1 w-[172px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white py-1 text-left shadow-lg"
          onKeyDown={(event) => {
            const buttons = Array.from(menuRef.current.querySelectorAll('button'));
            const index = buttons.indexOf(document.activeElement);
            const nextIndex = event.key === 'ArrowDown' ? (index + 1) % buttons.length
              : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
            if (nextIndex >= 0) {
              event.preventDefault();
              buttons[nextIndex]?.focus();
            }
          }}
        >
          {actions.map((action) => (
            <button key={action.label} type="button" role="menuitem"
              className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium leading-4 text-[#334155] hover:bg-[#F5F3FF] focus:bg-[#F5F3FF] focus:outline-none"
              onClick={() => {
                setIsOpen(false);
                buttonRef.current?.focus();
                action.onClick();
              }}
            >{action.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
