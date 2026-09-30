'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Kv } from '@/components/ui/blocks';
import { Chip, DocChip } from '@/components/ui/chip';
import { Disc } from '@/components/ui/colour';
import { Sheet, SheetActions, SheetRow } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';

/** The pieces that need a click to show: a sheet and a toast. */
export function SurfaceDemos() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" icon="inbox" onClick={() => setOpen(true)}>
        Open a sheet
      </Button>
      <Button
        variant="secondary"
        icon="check"
        onClick={() => toast('Marked paid · $215.80 to Jordan')}
      >
        Show a toast
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Bill"
        title="Rent — October"
        lead={<Disc icon="home" colour="#4a3aa7" />}
      >
        <SheetRow>
          <DocChip state="analysed" />
          <Chip tone="warn" icon="pencil">
            1 detail to confirm
          </Chip>
        </SheetRow>
        <Kv
          rows={[
            ['Arrived', 'Tue 29 Sep 2026 · Forwarded by Jordan'],
            [
              'From',
              <span key="from" className="mono">
                rent@riverside.example
              </span>,
            ],
            ['File', 'Rent statement October.pdf'],
          ]}
        />
        <p className="muted small">
          Everything else on the statement matched. Check the due date, then create the bill.
        </p>
        <SheetActions>
          <Button icon="check" onClick={() => setOpen(false)}>
            Create bill
          </Button>
          <Button variant="secondary" icon="eye" onClick={() => setOpen(false)}>
            View file
          </Button>
        </SheetActions>
      </Sheet>
    </div>
  );
}
