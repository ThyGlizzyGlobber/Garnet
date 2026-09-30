'use client';

import { ErrorScreen } from '@/components/app/error-screen';

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />;
}
