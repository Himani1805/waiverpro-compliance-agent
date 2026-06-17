/**
 * coverageUtils.js
 *
 * Shared utility used by both the HTTP API route (complianceRoutes.js)
 * and the CLI audit tool (bin/audit.js).
 *
 * Keeps the list of expected routes and the coverage % formula in ONE place,
 * so changing either only requires editing this file.
 */

// Every route the PDF guidelines defines. Used to measure how much of the
// app our scraper actually visited.
export const EXPECTED_ROUTES = [
  '/',
  '/login',
  '/privacy',
  '/terms',
  '/dashboard',
  '/dashboard/my-applications',
  '/dashboard/my-applications?newApplicationPanel=open',
  '/dashboard/facilities',
  '/dashboard/action-items',
  '/dashboard/user-management',
  '/dashboard/user-management?inviteUserPanel=open',
  '/dashboard/announcements',
  '/dashboard/faqs',
  '/dashboard/tickets',
  '/dashboard/tickets?newTicketPanel=open',
  '/dashboard/contact',
  '/dashboard/settings',
];

/**
 * Compares scraped routes against the expected list and returns a coverage %.
 *
 * @param {string[]} scrapedRoutes - Unique route paths found in the scraped UI data
 * @returns {{ matched: string[], percent: number }}
 */
export const computeCoverage = (scrapedRoutes) => {
  const matched = EXPECTED_ROUTES.filter(route => scrapedRoutes.includes(route));
  const percent = Math.round((matched.length / EXPECTED_ROUTES.length) * 100);
  return { matched, percent, totalExpected: EXPECTED_ROUTES.length };
};

