import { redirect } from 'next/navigation';

/** Status is the console's Health tab now (SCOPE-console.md C-D1). */
export default function StatusPage() {
  redirect('/console/health');
}
