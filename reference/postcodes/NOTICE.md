# Postcode reference data

`AU.tsv` is derived from the GeoNames postal code export for Australia
(<https://download.geonames.org/export/zip/AU.zip>, downloaded 29 September 2026),
licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Data © GeoNames (<https://www.geonames.org>), provided "as is" without warranty of
accuracy, timeliness or completeness.

Changes: one row per postcode; map point = mean of the most accurate locality
points; state and region = most common among its localities; localities listed
alphabetically. The app credits GeoNames in Settings wherever a location is shown.

To refresh or add a country, download `<CC>.zip` from the same place and rebuild
with the same rules (see the S2 entry in CLAUDE.md's decisions log).
