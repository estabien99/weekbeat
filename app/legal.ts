/**
 * Who runs the public site (given by the operator, 24.11.2026). Shown in the Impressum
 * (MStV § 18 Abs. 1: name and address) and as the contact on the privacy page (GDPR Art. 13(1)(a)).
 * Names and addresses are not translated, so they live here and not in the i18n files.
 */
export const OPERATOR = {
  name: 'Frank Michael',
  street: 'Thalkirchner Straße 186',
  city: '81371 München',
  country: { de: 'Deutschland', en: 'Germany' },
  email: 'weekbeat@f-michael.de',
} as const;
