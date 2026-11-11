# boyhood

[![Playwright tests](https://github.com/ManosVourtsanis/boyhood/actions/workflows/playwright.yml/badge.svg)](https://github.com/ManosVourtsanis/boyhood/actions/workflows/playwright.yml)

The source of my personal portfolio: a single static page (`index.html`) with my experience,
featured projects and a live list of my public GitHub repositories.

## Tests

The site is covered by Playwright end-to-end tests in [`tests/portfolio.spec.ts`](tests/portfolio.spec.ts).
They run on a desktop and a mobile viewport on every push, in GitHub Actions.

The GitHub API is mocked with `page.route`, so the tests are fast, never hit the rate limit,
and can cover cases that are hard to reproduce against the real API:

| Area | What is checked |
| --- | --- |
| Content | Role and skills, CV link returns a real PDF, profile photo loads, external links use `rel="noopener"` |
| Repositories | Forks are hidden, sorting by date and stars, search by name or description, empty-search message |
| Pagination | A second page is requested when GitHub sends a `Link: rel="next"` header |
| Failure modes | Rate limit (403) shows a fallback note; a network error shows an error message |
| Security | Repository names and descriptions with HTML are shown as text, and `javascript:` URLs are dropped |
| Mobile | The menu opens, updates `aria-expanded`, and closes after a section is chosen |

The tests were checked against deliberately broken versions of the page (escaping removed,
menu-closing removed) to make sure they fail when they should.

## Run locally

```bash
npm install
npx playwright install chromium
npm test
```

Playwright starts a local server (`python3 -m http.server`) for the tests on its own.
To browse the site, run `npm run serve` and open http://127.0.0.1:4173.

## License

[MIT](LICENSE)
