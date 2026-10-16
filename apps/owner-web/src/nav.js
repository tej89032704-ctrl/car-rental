/**
 * The rail's eight sections, in one place.
 *
 * Extracted from App.jsx so the command palette can offer the same list the
 * sidebar renders without importing the shell (which imports the palette) --
 * a cycle that happens to resolve in ESM, but only because nothing touches
 * these bindings at module scope.
 */
export const NAV = [
  { k: 'cars', to: '/', icon: 'cars', label: 'My Cars', sub: 'Your fleet and availability', end: true },
  { k: 'reqs', to: '/requests', icon: 'reqs', label: 'Booking Requests', sub: 'Approve or decline new trips' },
  { k: 'cal', to: '/calendar', icon: 'cal', label: 'Calendar', sub: 'Bookings and blocked dates' },
  { k: 'revs', to: '/reviews', icon: 'revs', label: 'My Reviews', sub: 'What renters say about you' },
  { k: 'earn', to: '/earnings', icon: 'earn', label: 'Earnings', sub: 'Income and payouts' },
  { k: 'ver', to: '/kyc', icon: 'ver', label: 'Verification', sub: 'Keep your listings trusted' },
  { k: 'not', to: '/notifications', icon: 'not', label: 'Notifications', sub: 'Everything that needs you' },
  { k: 'prof', to: '/profile', icon: 'prof', label: 'Profile', sub: 'Your details and payout account' },
];

export const sectionOf = (path) => NAV.find((n) => n.to === path) || NAV[0];
