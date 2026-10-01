'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/components/ui/form';
import { leaveHouseholdAction } from './actions';

/** Leave a household: confirmed first; the reason it can't be left yet shows under the link. */
export function LeaveButton({
  memberId,
  label,
  confirm,
}: {
  memberId: string;
  label: string;
  confirm: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(leaveHouseholdAction, {});
  return (
    <form
      action={action}
      className="hh-leave"
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="memberId" value={memberId} />
      <button type="submit" className="link small" disabled={pending}>
        {label}
      </button>
      {state.error && (
        <span role="alert" className="bad-text small">
          {state.error}
        </span>
      )}
    </form>
  );
}
