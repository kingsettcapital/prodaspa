/**
 * Canonical SpaceTypeCode values for [dbo].[PropertyMst].
 *
 * Single source of truth for the Add and Edit property dialogs. Phase 3
 * chips must consume this rather than introducing a third copy.
 *
 * There is no server-side whitelist on SpaceTypeCode, so this list is
 * advisory: the API will persist any value it receives. Legacy or
 * out-of-band values are surfaced via spaceTypeOptionsFor() rather than
 * being silently dropped.
 */
export interface SpaceTypeOption {
  code: string;
  label: string;
}

export const SPACE_TYPE_OPTIONS: readonly SpaceTypeOption[] = [
  { code: 'OF', label: 'Office (OF)' },
  { code: 'RT', label: 'Retail (RT)' },
  { code: 'IND', label: 'Industrial (IND)' },
  { code: 'ST', label: 'Storage (ST)' },
  { code: 'OTH', label: 'Other (OTH)' }
];

/**
 * Returns the option list for a dialog editing an existing record.
 *
 * If the record's current code is not canonical, it is prepended as a
 * distinct option so the user sees the true stored value and can save
 * other fields without silently overwriting it.
 */
export function spaceTypeOptionsFor(currentCode: string | null | undefined): SpaceTypeOption[] {
  const code = (currentCode ?? '').trim();
  const options = [...SPACE_TYPE_OPTIONS];

  if (!code) {
    return options;
  }

  const isKnown = options.some(
    opt => opt.code.toUpperCase() === code.toUpperCase()
  );

  if (isKnown) {
    return options;
  }

  return [{ code, label: `${code} (unrecognized)` }, ...options];
}
