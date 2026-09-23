import { getRequestConfig } from 'next-intl/server';

/**
 * Single-locale setup for the alpha: every UI string lives in messages/en.json.
 * Adding a language later means adding a messages file and choosing it here
 * (from the household setting), not touching components.
 */
export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
