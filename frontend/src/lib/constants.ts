/**
 * constants.ts — site-wide constants.
 */

export const SITE_URL = 'https://shop.choirulhaq.com';

/**
 * Bank accounts shown on the order confirmation page (manual transfer).
 * ⚠️  FILL IN YOUR REAL ACCOUNT NUMBERS BEFORE LAUNCH — these are
 * placeholders and are clearly marked as such in the README.
 */
export const BANK_ACCOUNTS = [
  {
    bank: 'BCA',
    account: '0000000000',
    account_name: 'Choirul Haq',
  },
  {
    bank: 'Mandiri',
    account: '0000000000',
    account_name: 'Choirul Haq',
  },
];

export const ORDER_STATUSES = ['pending', 'paid', 'delivered', 'cancelled', 'refunded'] as const;

export const ADMIN_EMAIL = 'admin@choirulhaq.com';
