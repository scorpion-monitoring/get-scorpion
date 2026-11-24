// The Matomo tracker of the landing page (docs/plan.md §6): our own Matomo at
// https://scorpion.bi.denbi.de/matomo/ (same origin, deployed by scorpion-infra), site id 1. Cookieless,
// and Do-Not-Track is respected here as well as by the server, which also anonymises IPs (2 bytes).
//
// This file is bundled into an external, hashed script, like src/scripts/events.ts, so the page keeps
// `script-src 'self'` (no inline snippet). It loads /matomo/matomo.js from our origin; the tracker
// sends its hits to /matomo/matomo.php (`connect-src 'self'`, or an image under `img-src 'self'`).
type MatomoCommand = [string, ...unknown[]];

const MATOMO = '/matomo/';
const SITE_ID = '1';

const w = window as Window & { _paq?: MatomoCommand[] };
const paq = (w._paq = w._paq ?? []);
paq.push(['setDoNotTrack', true]);
paq.push(['disableCookies']);
paq.push(['setTrackerUrl', `${MATOMO}matomo.php`]);
paq.push(['setSiteId', SITE_ID]);
paq.push(['trackPageView']);
paq.push(['enableLinkTracking']);

const script = document.createElement('script');
script.async = true;
script.src = `${MATOMO}matomo.js`;
document.head.append(script);
