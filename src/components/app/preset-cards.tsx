import { useTranslations } from 'next-intl';
import { APPEARANCE_PRESETS } from '@/db/schema';
import type { Preset } from '@/lib/appearance';
import { Icon } from './icons';

/**
 * The five colour presets as cards, each with a small preview of its scene,
 * glass and accent drawn in the current light or dark (its own data-palette).
 * Each card is a submit button named "preset" for the form around it.
 */
export function PresetCards({ current }: { current: Preset }) {
  const t = useTranslations('appearance');
  return (
    <div className="presets">
      {APPEARANCE_PRESETS.map((p) => (
        <button key={p} name="preset" value={p} className="preset" aria-pressed={p === current}>
          <span className="preset-prev" data-palette={p} aria-hidden="true">
            <i className="pp-b1" />
            <i className="pp-b2" />
            <i className="pp-b3" />
            <span className="pp-card">
              <i className="pp-ring" />
              <span className="pp-lines">
                <i />
                <i />
              </span>
              <i className="pp-btn" />
            </span>
          </span>
          <span className="preset-t">
            <b>{t(`presets.${p}.name`)}</b>
            <span>{t(`presets.${p}.blurb`)}</span>
          </span>
          <span className="preset-check" aria-hidden="true">
            <Icon name="check" width={13} height={13} />
          </span>
        </button>
      ))}
    </div>
  );
}
