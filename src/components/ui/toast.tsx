'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { cx } from './cx';

/**
 * Toasts: a short confirmation that floats in from the top for a moment
 * ("Marked paid · $215.80 to Jordan", "Address copied"). One provider in the
 * root layout; `useToast()` anywhere below it.
 */
interface ToastItem {
  id: number;
  text: string;
  out: boolean;
}

const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string) => {
    const id = next.current++;
    setItems((list) => [...list, { id, text, out: false }]);
    setTimeout(
      () => setItems((list) => list.map((t) => (t.id === id ? { ...t, out: true } : t))),
      2200,
    );
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('toast glass-strong', t.out && 'out')}>
            <Icon name="check" width={16} height={16} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
