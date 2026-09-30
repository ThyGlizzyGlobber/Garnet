'use client';

import { ErrorScreen } from '@/components/app/error-screen';

/** An error outside the signed-in shell (sign-in, setup, the wall). */
export default function RootError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="outside">
      <div className="public">
        <ErrorScreen {...props} />
      </div>
    </main>
  );
}
