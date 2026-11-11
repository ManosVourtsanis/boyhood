import { test, expect, type Page, type Route } from "@playwright/test";

const REPOS_API = "https://api.github.com/users/ManosVourtsanis/repos**";

type Repo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  created_at: string;
  updated_at: string;
};

const repo = (overrides: Partial<Repo>): Repo => ({
  name: "repo",
  description: "A repository",
  html_url: "https://github.com/ManosVourtsanis/repo",
  language: "TypeScript",
  stargazers_count: 0,
  fork: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const DEFAULT_REPOS: Repo[] = [
  repo({ name: "old-but-starred", stargazers_count: 10, created_at: "2021-01-01T00:00:00Z" }),
  repo({ name: "newest-repo", description: "Playwright framework", stargazers_count: 1, created_at: "2026-01-01T00:00:00Z" }),
  repo({ name: "forked-repo", fork: true, created_at: "2025-01-01T00:00:00Z" }),
];

async function mockRepos(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route(REPOS_API, handler);
}

const repoCards = (page: Page) => page.getByTestId("repo-card");
const repoNames = (page: Page) => repoCards(page).locator("h3");
// Matches the standalone `hidden` class, not `md:hidden`.
const HIDDEN = /(^|\s)hidden(\s|$)/;

test.describe("About section", () => {
  test.beforeEach(async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");
  });

  test("shows the role and key skills", async ({ page }) => {
    const about = page.locator("#about");
    await expect(about.getByText("Software Engineer in Test").first()).toBeVisible();
    for (const skill of ["Playwright", "API Testing · Postman", "AI-assisted testing", "ISTQB CTFL"]) {
      await expect(about.getByRole("listitem").filter({ hasText: skill })).toBeVisible();
    }
  });

  test("CV link points to a PDF that exists", async ({ page, request }) => {
    const cvLink = page.getByRole("link", { name: "Download CV" });
    const href = await cvLink.getAttribute("href");
    expect(href).toMatch(/\.pdf$/);

    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
  });

  test("profile photo loads", async ({ page }) => {
    const img = page.getByAltText("Photo of Manos Vourtsanis");
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test("every external link opens safely in a new tab", async ({ page }) => {
    const external = page.locator('a[target="_blank"]');
    expect(await external.count()).toBeGreaterThan(0);
    for (const link of await external.all()) {
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });
});

test.describe("Experience and featured projects", () => {
  test.beforeEach(async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");
  });

  test("lists current roles", async ({ page }) => {
    const experience = page.locator("#experience");
    await expect(experience.getByRole("heading", { name: /Kaizen Gaming/ })).toBeVisible();
    await expect(experience.getByRole("heading", { name: /Seago/ })).toBeVisible();
  });

  test("renders the hand-picked projects", async ({ page }) => {
    const cards = page.getByTestId("featured-card");
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText("Seago");
  });
});

test.describe("GitHub repositories", () => {
  test("hides forks and sorts newest first by default", async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");

    await expect(repoNames(page)).toHaveText(["newest-repo", "old-but-starred"]);
  });

  test("sorts by stars", async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");

    await page.getByLabel("Sort repositories").selectOption("stars");
    await expect(repoNames(page)).toHaveText(["old-but-starred", "newest-repo"]);
  });

  test("search matches name or description, and says when nothing matches", async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");

    const search = page.getByLabel("Search repositories");
    await search.fill("PLAYWRIGHT");
    await expect(repoNames(page)).toHaveText(["newest-repo"]);

    await search.fill("does-not-exist");
    await expect(repoCards(page)).toHaveCount(0);
    await expect(page.locator("#projects-container")).toContainText("No repositories match");
  });

  test("follows pagination through the Link header", async ({ page }) => {
    const requestedPages: string[] = [];
    await mockRepos(page, (route) => {
      const pageParam = new URL(route.request().url()).searchParams.get("page") ?? "1";
      requestedPages.push(pageParam);
      if (pageParam === "1") {
        return route.fulfill({
          json: [repo({ name: "page-one" })],
          // GitHub exposes Link to browsers via CORS; without this header the page cannot read it.
          headers: {
            Link: '<https://api.github.com/user/1/repos?page=2>; rel="next"',
            "Access-Control-Expose-Headers": "Link",
          },
        });
      }
      return route.fulfill({ json: [repo({ name: "page-two", created_at: "2020-01-01T00:00:00Z" })] });
    });
    await page.goto("/");

    await expect(repoNames(page)).toHaveText(["page-one", "page-two"]);
    expect(requestedPages).toEqual(["1", "2"]);
  });

  test("shows a fallback note when GitHub rate-limits the request", async ({ page }) => {
    await mockRepos(page, (route) => route.fulfill({ status: 403, json: { message: "API rate limit exceeded" } }));
    await page.goto("/");

    await expect(page.locator("#rateLimitNote")).not.toHaveClass(HIDDEN);
    await expect(page.locator("#rateLimitNote")).toContainText("See them on GitHub");
    await expect(repoCards(page)).toHaveCount(0);
  });

  test("shows an error when GitHub is unreachable", async ({ page }) => {
    await mockRepos(page, (route) => route.abort("failed"));
    await page.goto("/");

    await expect(page.locator("#projects-container")).toContainText("Failed to load repositories.");
  });

  test("renders repository text as text, not HTML", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });
    await mockRepos(page, (route) =>
      route.fulfill({
        json: [
          repo({
            name: "<b>bold</b>",
            description: '<img src=x onerror="alert(1)">',
            html_url: "javascript:alert(1)",
          }),
        ],
      }),
    );
    await page.goto("/");

    const card = repoCards(page).first();
    await expect(card.locator("h3")).toHaveText("<b>bold</b>");
    await expect(card).toContainText('<img src=x onerror="alert(1)">');
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveCount(0);
    expect(dialogOpened).toBe(false);
  });
});

test.describe("Mobile navigation", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, "The menu button only exists on small screens");
    await mockRepos(page, (route) => route.fulfill({ json: DEFAULT_REPOS }));
    await page.goto("/");
  });

  test("opens, then closes after choosing a section", async ({ page }) => {
    const menuButton = page.getByRole("button", { name: "Menu" });
    const menu = page.locator("#mobileMenu");

    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(menu).not.toHaveClass(HIDDEN);

    await menu.getByRole("link", { name: "Projects" }).click();
    await expect(menu).toHaveClass(HIDDEN);
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#projects$/);
  });
});
