import { Check, ChevronDown, Search } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type DropdownOption<T = unknown> = {
  label: string;
  value: T;
  icon?: string;
  description?: string;
  disabled?: boolean;
};

type DropdownFooterState = {
  searchQuery: string;
  close: () => void;
};

type BaseDropdownProps<T> = {
  options: Array<DropdownOption<T>>;
  value: T;
  onChange: (value: T, option: DropdownOption<T>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  triggerIcon?: ReactNode;
  searchPlaceholder?: string;
  emptyLabel?: string;
  searchable?: boolean | 'auto';
  footer?: (state: DropdownFooterState) => ReactNode;
};

const SEARCH_THRESHOLD = 7;

export function BaseDropdown<T>({
  options,
  value,
  onChange,
  placeholder = 'Select option',
  disabled = false,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  triggerIcon,
  searchPlaceholder = 'Search options',
  emptyLabel = 'No options found',
  searchable = 'auto',
  footer,
}: BaseDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldSearch = searchable === true || (searchable === 'auto' && options.length > SEARCH_THRESHOLD);

  const selectedOption = useMemo(
    () => options.find((option) => Object.is(option.value, value)) ?? null,
    [options, value],
  );

  const visibleOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!shouldSearch || !query) return options;

    return options.filter((option) =>
      [option.label, option.description, option.icon]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(query)),
    );
  }, [options, searchQuery, shouldSearch]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(firstEnabledIndex(visibleOptions));
  }, [open, visibleOptions]);

  useEffect(() => {
    if (!open || !shouldSearch) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [open, shouldSearch]);

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 6;
      const maxHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const opensUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = Math.max(160, Math.min(maxHeight, (opensUp ? spaceAbove : spaceBelow) - 8));

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 1000,
        maxHeight: availableHeight,
        ...(opensUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      close();
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    setSearchQuery('');
    setActiveIndex(0);
  };

  const selectOption = (option: DropdownOption<T>) => {
    if (option.disabled) return;
    onChange(option.value, option);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (disabled) return;

    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        nextEnabledIndex(visibleOptions, current, event.key === 'ArrowDown' ? 1 : -1),
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) {
        selectOption(option);
      }
    }
  };

  const menu = open ? (
    <div
      ref={menuRef}
      className={`flex flex-col overflow-hidden rounded-lg border border-[#444] bg-[#2a2a2a] text-[#eee] shadow-[0_18px_45px_rgba(0,0,0,0.34)] ${menuClassName}`}
      style={menuStyle}
    >
      {shouldSearch ? (
        <label className="relative block border-b border-[#444] p-2">
          <Search
            size={15}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            ref={searchInputRef}
            className="min-h-9 w-full rounded-md border border-[#444] bg-[#222] py-1 pl-9 pr-3 text-sm font-semibold text-[#eee] outline-none transition placeholder:text-zinc-500 focus:border-mint focus:ring-2 focus:ring-mint/25"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
          />
        </label>
      ) : null}

      <div className="min-h-0 overflow-y-auto py-1" role="listbox">
        {visibleOptions.length > 0 ? (
          visibleOptions.map((option, index) => {
            const selected = selectedOption ? Object.is(option.value, selectedOption.value) : false;
            const active = index === activeIndex;
            return (
              <button
                key={String(option.value)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                  active ? 'bg-[#333]' : 'hover:bg-[#333]'
                } ${option.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                disabled={option.disabled}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {option.icon ? <span className="shrink-0 text-base leading-none">{option.icon}</span> : null}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-zinc-400">{option.description}</span>
                    ) : null}
                  </span>
                </span>
                {selected ? <Check size={15} className="shrink-0 text-mint" /> : null}
              </button>
            );
          })
        ) : (
          <div className="min-h-10 px-3 py-2 text-sm font-semibold text-zinc-500">
            {emptyLabel}
          </div>
        )}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-[#444] bg-[#2a2a2a] p-2">
          {footer({ searchQuery, close })}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#444] bg-[#222] px-3 text-left text-sm font-semibold text-[#eee] outline-none transition hover:bg-[#262626] focus:border-mint focus:ring-2 focus:ring-mint/30 disabled:cursor-not-allowed disabled:opacity-60 ${triggerClassName}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedOption?.icon ? (
            <span className="shrink-0 text-base leading-none">{selectedOption.icon}</span>
          ) : null}
          <span className={selectedOption ? 'truncate' : 'truncate text-zinc-400'}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <span className="shrink-0 text-zinc-400">
          {triggerIcon ?? (
            <ChevronDown
              size={16}
              className={`transition ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  );
}

function firstEnabledIndex<T>(options: Array<DropdownOption<T>>) {
  const index = options.findIndex((option) => !option.disabled);
  return index >= 0 ? index : 0;
}

function nextEnabledIndex<T>(options: Array<DropdownOption<T>>, currentIndex: number, direction: 1 | -1) {
  if (options.length === 0) return 0;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const nextIndex = (currentIndex + offset * direction + options.length) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return currentIndex;
}
