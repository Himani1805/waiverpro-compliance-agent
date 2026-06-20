import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';


const NAV_TIMEOUT = 45000; // Page load timeout.

// Elements to collect from full pages.
const PAGE_SELECTORS = 'h1, h2, h3, h4, th, td, button, span, p, a, label, li, nav, [role="tab"], [role="menuitem"]';

// Elements to collect inside panels.
const PANEL_SELECTORS = 'h1, h2, h3, h4, button, span, p, label, li';


// Browser helpers used by page.evaluate().
const collectElements = (routePath, selectors, prefix) => {
  const nodes = document.querySelectorAll(selectors);
  const items = [];
  const seenTexts = new Set();

  nodes.forEach((node, idx) => {
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 300);
    if (!text || text.length < 3) return;
    if (seenTexts.has(text)) return;
    seenTexts.add(text);

    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role');

    let type = 'text_block';
    if (['button', 'a'].includes(tag) || role === 'button') type = 'interactive_element';
    else if (['h1', 'h2', 'h3', 'h4'].includes(tag))        type = 'header_element';
    else if (['th', 'td'].includes(tag))                     type = 'table_cell';
    else if (tag === 'li' || role === 'menuitem')            type = 'navigation_item';

    items.push({
      page_url:            routePath,
      component_type:      type,
      component_selector:  `${prefix}${tag}:nth-of-type(${idx + 1})`,
      actual_text_content: text,
    });
  });

  return items;
};

// Collect text from the open panel instead of the whole page.
const collectPanelElements = (routePath, selectors, prefix) => {
  const candidates = [
    ...document.querySelectorAll('[role="dialog"], aside, .fixed, [class*="fixed"], [class*="drawer"], [class*="modal"]'),
    document.body
  ];

  const visibleCandidates = candidates.filter(node => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });

  const panel = visibleCandidates
    .map(node => ({ node, count: node.querySelectorAll(selectors).length }))
    .sort((a, b) => b.count - a.count)[0]?.node || document.body;

  const nodes = panel.querySelectorAll(selectors);
  const items = [];
  const seenTexts = new Set();

  nodes.forEach((node, idx) => {
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 300);
    if (!text || text.length < 3) return;
    if (seenTexts.has(text)) return;
    seenTexts.add(text);

    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role');

    let type = 'text_block';
    if (['button', 'a'].includes(tag) || role === 'button') type = 'interactive_element';
    else if (['h1', 'h2', 'h3', 'h4'].includes(tag))        type = 'header_element';

    items.push({
      page_url:            routePath,
      component_type:      type,
      component_selector:  `${prefix}${tag}:nth-of-type(${idx + 1})`,
      actual_text_content: text,
    });
  });

  return items;
};


// Save a full-page screenshot using the route as the filename.
const takeScreenshot = async (page, routePath, screenshotDir) => {
  const filename = routePath
    .replace(/\?/g, '_')
    .replace(/=/g, '_')
    .replace(/\//g, '_')
    .replace(/^_/, '') || 'home';

  const screenshotPath = path.join(screenshotDir, `${filename}.png`);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[SCRAPER] Screenshot saved: ${filename}.png`);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
};

// Open a panel, scrape it, then close it.
const scrapeModalPanel = async (page, baseUrl, navRoute, buttonText, virtualRoute, prefix, screenshotDir) => {
  try {
    await page.goto(`${baseUrl}${navRoute}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.waitForSelector('button', { timeout: 10000 });

    // Click the panel trigger by its visible text.
    const clicked = await page.evaluate((text) => {
      const candidates = Array.from(document.querySelectorAll('button, a')).filter(el => {
        const rect = el.getBoundingClientRect();
        const label = (el.textContent || '').trim().replace(/\s+/g, ' ');
        return rect.width > 0 && rect.height > 0 && label.includes(text);
      });
      const btn = candidates.find(el => el.tagName.toLowerCase() === 'button') || candidates[0];
      if (btn) { btn.click(); return true; }
      return false;
    }, buttonText);

    if (!clicked) {
      console.warn(`[SCRAPER] Could not find button with text: "${buttonText}"`);
      return [];
    }

    // Wait for panel content to appear.
    await page.waitForFunction(() => {
      const nodes = document.querySelectorAll('[role="dialog"], aside, .fixed, [class*="fixed"], [class*="drawer"], [class*="modal"]');
      return Array.from(nodes).some(node => {
        const rect = node.getBoundingClientRect();
        const text = (node.textContent || '').trim();
        return rect.width > 0 && rect.height > 0 && text.length > 0;
      });
    }, { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await takeScreenshot(page, virtualRoute, screenshotDir);

    const elements = await page.evaluate(collectPanelElements, virtualRoute, PANEL_SELECTORS, prefix);
    console.log(`[SCRAPER] Extracted ${elements.length} elements from panel: ${virtualRoute}`);

    // Close the panel before moving to the next page.
    await page.evaluate(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Close') || b.textContent.includes('×') ||
        b.textContent === 'X' || b.textContent === 'Cancel'
      );
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    return elements;
  } catch (err) {
    console.warn(`[SCRAPER] Could not scrape panel "${virtualRoute}": ${err.message}`);
    return [];
  }
};


// Main scraper used by the audit pipeline.
export const extractUIState = async () => {
  let browser;

  try {
    console.log('[SCRAPER] Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking'
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const baseUrl = (process.env.TARGET_URL || 'https://white-cliff-0bca3ed00.1.azurestaticapps.net').replace(/\/$/, '');
    const email    = process.env.TARGET_AUTH_EMAIL    || 'admin@gmail.com';
    const password = process.env.TARGET_AUTH_PASSWORD || 'password';

    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const allElements = [];

    for (const route of ['/', '/privacy', '/terms']) {
      console.log(`[SCRAPER] Scraping public page: ${route}`);
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      await takeScreenshot(page, route, screenshotDir);
      allElements.push(...await page.evaluate(collectElements, route, PAGE_SELECTORS, ''));
    }

    console.log('[SCRAPER] Scraping login page...');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await takeScreenshot(page, '/login', screenshotDir);
    allElements.push(...await page.evaluate(collectElements, '/login', PAGE_SELECTORS, ''));

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', email, { delay: 30 });
    await page.type('input[type="password"]', password, { delay: 30 });
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {
      console.warn('[SCRAPER] Login redirect timed out; proceeding anyway.');
    });
    console.log(`[SCRAPER] Logged in. Current URL: ${page.url()}`);

    // Turn on settings that affect page content.
    try {
      await page.goto(`${baseUrl}/dashboard/settings`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      await page.waitForSelector('button', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 1000));

      await page.evaluate(() => {
        // Click toggles that are currently off.
        document.querySelectorAll('button[role="switch"], button[role="checkbox"], input[type="checkbox"]')
          .forEach(toggle => {
            const isOn = toggle.getAttribute('aria-checked') === 'true' ||
                         toggle.checked ||
                         toggle.className.includes('bg-indigo-600');
            if (!isOn) toggle.click();
          });

        // Save settings when the button is present.
        const saveBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.includes('Save') || b.textContent.includes('Change'));
        if (saveBtn) saveBtn.click();
      });

      await new Promise(r => setTimeout(r, 1500)); // Wait for settings to save.
      console.log('[SCRAPER] Feature toggles enabled.');
    } catch (err) {
      console.warn(`[SCRAPER] Could not pre-enable settings toggles: ${err.message}`);
    }

    const authRoutes = [
      { path: '/dashboard',               label: 'Main Dashboard' },
      { path: '/dashboard/my-applications', label: 'My Applications' },
      { path: '/dashboard/facilities',    label: 'Facilities' },
      { path: '/dashboard/action-items',  label: 'Action Items' },
      { path: '/dashboard/user-management', label: 'User Management' },
      { path: '/dashboard/announcements', label: 'Announcements' },
      { path: '/dashboard/faqs',          label: 'FAQs' },
      { path: '/dashboard/tickets',       label: 'Support Tickets' },
      { path: '/dashboard/contact',       label: 'Contact' },
      { path: '/dashboard/settings',      label: 'Settings' },
    ];

    for (const { path: routePath, label } of authRoutes) {
      console.log(`[SCRAPER] Scraping: ${label}`);
      try {
        await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
        // Give client-side content a moment to render.
        await page.waitForSelector('h1, h2, h3, table, main, button', { timeout: 8000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        await takeScreenshot(page, routePath, screenshotDir).catch(err => {
          console.warn(`[SCRAPER] Screenshot failed for ${routePath}: ${err.message}`);
        });
        allElements.push(...await page.evaluate(collectElements, routePath, PAGE_SELECTORS, ''));
      } catch (err) {
        console.warn(`[SCRAPER] Could not scrape ${routePath}: ${err.message}`);
      }
    }

    // Panels that open from buttons.
    const panels = [
      {
        navRoute:     '/dashboard/my-applications',
        buttonText:   'New',
        virtualRoute: '/dashboard/my-applications?newApplicationPanel=open',
        prefix:       'panel-',
      },
      {
        navRoute:     '/dashboard/user-management',
        buttonText:   'Invite User',
        virtualRoute: '/dashboard/user-management?inviteUserPanel=open',
        prefix:       'panel-invite-',
      },
      {
        navRoute:     '/dashboard/tickets',
        buttonText:   'New Ticket',
        virtualRoute: '/dashboard/tickets?newTicketPanel=open',
        prefix:       'panel-ticket-',
      },
    ];

    for (const panel of panels) {
      const elements = await scrapeModalPanel(
        page, baseUrl, panel.navRoute, panel.buttonText,
        panel.virtualRoute, panel.prefix, screenshotDir
      );
      allElements.push(...elements);
    }

    // Remove repeated text on the same route.
    const seen = new Set();
    const uniqueElements = allElements.filter(el => {
      const key = `${el.page_url}::${el.actual_text_content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[SCRAPER] Done. ${uniqueElements.length} unique elements scraped across all pages.`);
    return uniqueElements;

  } catch (err) {
    console.error(`[SCRAPER] Fatal error: ${err.message}`);
    throw err;
  } finally {
    if (browser) {
      console.log('[SCRAPER] Closing browser.');
      await browser.close();
    }
  }
};

