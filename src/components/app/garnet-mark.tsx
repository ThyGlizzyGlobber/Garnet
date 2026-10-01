/**
 * The Garnet mark: the faceted stone in Pyrope tones, lit from the top left
 * (BRAND.md §1; brand-identity/garnet-gem.svg is the same drawing). Fixed
 * colours, the same in light and dark: it is the one rich object on a page.
 */
const FACETS: [string, string][] = [
  ['50,4 26.9,27.1 50,22.9', '#E04440'],
  ['26.9,27.1 4,50 23.1,50', '#DF3433'],
  ['26.9,27.1 23.1,50 50,22.9', '#CB1C22'],
  ['50,4 73.1,27.1 50,22.9', '#8F111E'],
  ['73.1,27.1 96,50 76.9,50', '#7F0F1C'],
  ['73.1,27.1 76.9,50 50,22.9', '#BF1921'],
  ['50,96 73.1,72.9 50,76.9', '#660C19'],
  ['73.1,72.9 96,50 76.9,50', '#770E1C'],
  ['73.1,72.9 76.9,50 50,76.9', '#C00A15'],
  ['50,96 26.9,72.9 50,76.9', '#DE2526'],
  ['26.9,72.9 4,50 23.1,50', '#DF3433'],
  ['26.9,72.9 23.1,50 50,76.9', '#BF1921'],
  ['23.1,50 50,22.9 50,50', '#E8988E'],
  ['50,22.9 76.9,50 50,50', '#A0131F'],
  ['76.9,50 50,76.9 50,50', '#DC0B12'],
  ['50,76.9 23.1,50 50,50', '#8F111E'],
];

export function GarnetMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="mark-gem">
      {FACETS.map(([points, fill]) => (
        <polygon
          key={points}
          points={points}
          fill={fill}
          stroke={fill}
          strokeWidth={0.4}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
