import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyCard } from '@/components/ui/blocks';

/**
 * The whole-screen states (§5): a page that isn't here, and something that
 * went wrong. Server-safe; the error screen's Try again is wired by the
 * client error boundaries in src/app/error.tsx and (app)/error.tsx.
 */
export function NotFoundCard({ title, body, home }: { title: string; body: string; home: string }) {
  return (
    <div className="scr">
      <EmptyCard icon="search" title={title} body={body}>
        <Link href="/" className="btn btn-primary">
          {home}
        </Link>
      </EmptyCard>
    </div>
  );
}

export function ErrorCard({
  title,
  body,
  reference,
  children,
}: {
  title: string;
  body: string;
  /** "Ref 7F3A-21C9", when the error carried a digest. */
  reference?: string;
  children: ReactNode;
}) {
  return (
    <div className="scr">
      <EmptyCard
        icon="alert"
        title={title}
        body={
          <>
            {body}
            {reference && (
              <>
                <br />
                <span className="mono small">{reference}</span>
              </>
            )}
          </>
        }
      >
        {children}
      </EmptyCard>
    </div>
  );
}
