'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { NavServices, type NavServicesRow, type NavServicesSection } from './nav-services';
import type { NavLine } from '@/lib/nav-layout';

/**
 * Arranging the services on the Services page (SCOPE-header.md H-D3): an
 * Arrange button opens a glass card holding the household's groups and My
 * Services as draggable lines (NavServices, as the side menu had them);
 * every change saves at once and the page's sections follow. Admins arrange
 * the household's part; everyone their own.
 */
export function ArrangeServices({
  sections,
  mine,
  rows,
  lines,
  admin,
  labels,
}: {
  sections: NavServicesSection[];
  mine: NavServicesSection[];
  rows: NavServicesRow[];
  lines: NavLine[];
  admin: boolean;
  labels: {
    open: string;
    close: string;
    head: string;
    thisMonth: string;
    other: string;
    mine: string;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="arr-head">
        <Button
          variant="secondary"
          size="sm"
          icon={open ? 'check' : 'move'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? labels.close : labels.open}
        </Button>
      </div>
      {open && (
        <div className="glass arr-card rounded-card">
          <NavServices
            sections={sections}
            mine={mine}
            rows={rows}
            lines={lines}
            admin={admin}
            labels={{
              head: labels.head,
              thisMonth: labels.thisMonth,
              other: labels.other,
              mine: labels.mine,
            }}
          />
        </div>
      )}
    </>
  );
}
