import { chipClass } from '@/components/ui';

/**
 * A page's search box (Bills, Inbox): a plain GET form, so results have their
 * own URL. `keep` carries the page's other filters along with the search.
 */
export function SearchBar({
  action,
  q,
  keep = {},
  placeholder,
  label,
  submit,
}: {
  action: string;
  q: string;
  keep?: Record<string, string | null | undefined>;
  placeholder: string;
  label: string;
  submit: string;
}) {
  return (
    <form action={action} className="flex gap-2">
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface-2 px-4 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" className={chipClass()}>
        {submit}
      </button>
    </form>
  );
}
