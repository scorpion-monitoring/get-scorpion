# Security policy

This policy covers the Scorpion landing page at <https://scorpion.bi.denbi.de/>. For the Scorpion
application, use the
[application's security policy](https://github.com/scorpion-monitoring/scorpion/security/policy).

## Supported versions

Only the current state of `main`, and the container image built from it, receives security fixes.
There are no maintained older versions.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability.

1. **Preferred:** use GitHub's private vulnerability reporting. On the repository page, open
   **Security**, then **Report a vulnerability**.
2. **Fallback:** write to <feser@ipk-gatersleben.de>. Do not put exploit details into an unencrypted
   mail if you can avoid it: send a short note and ask for a secure channel.

Please include the URL or commit, what you did, what happened, and what you expected. A proof of
concept helps. Do not include real personal data.

## What to expect

The landing page has one maintainer, so these times are working days, not a service level:

- **Acknowledgement** within 5 days.
- **A fix or a decision** within 90 days. The decision says whether the report is accepted, and if it
  is, when a fix will ship. If the fix needs longer, you hear why before the 90 days are over.
- **Credit** in the fix's pull request or advisory if you want it. Tell us how you wish to be named,
  or that you prefer not to be.
- **Disclosure:** we ask you to keep the report private until the fix is deployed, or until the 90
  days have passed, whichever comes first. We publish a GitHub security advisory with the fix.

## Scope

In scope:

- The site served at `https://scorpion.bi.denbi.de/` and `https://scorpion.bi.denbi.de/de/`, and the
  code in this repository that builds it.
- The container image this repository publishes (`ghcr.io/scorpion-monitoring/get-scorpion`),
  including its nginx configuration and response headers.
- The GitHub Actions workflows of this repository, and what they publish (for example the events
  feed).

Out of scope:

- The Scorpion application and its instances, including `/denbi/`, `/nfdi/` and the demo at
  `https://test.scorpion.bi.denbi.de/`. Report those through the application's security policy (linked
  above) or to the operator.
- The reverse proxy and host in front of the container, and the linked sites of other organisations.
- Vulnerabilities in third-party dependencies or base images. Report them upstream. If this site uses
  one in a way that makes the flaw reachable, tell us.
- Social engineering, physical attacks, and denial of service by sending a very large volume of
  traffic.

## Safe harbour

If you act in good faith, stay within this policy, and do not access or change data that is not
yours, we will not take legal action against you for your research.
