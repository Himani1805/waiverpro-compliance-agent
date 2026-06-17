import { EXPECTED_ROUTES } from '../utils/coverageUtils.js';

// Route-to-guideline lookup.
const routeToSectionMap = {
  '/': ['SECTION 2', 'Landing'],
  '/login': ['SECTION 3', 'Signing In'],
  '/dashboard': ['SECTION 4', 'Workspace'],
  '/dashboard/my-applications': ['SECTION 5', 'My Applications'],
  '/dashboard/my-applications?newApplicationPanel=open': ['SECTION 6', 'Submitting a New Waiver'],
  '/dashboard/facilities': ['SECTION 7', 'Facilities'],
  '/dashboard/action-items': ['SECTION 8', 'Action Items'],
  '/dashboard/user-management': ['SECTION 9', 'User Management'],
  '/dashboard/announcements': ['SECTION 10', 'Announcements'],
  '/dashboard/faqs': ['SECTION 11', 'FAQs'],
  '/dashboard/tickets': ['SECTION 11', 'Tickets'],
  '/dashboard/contact': ['SECTION 11', 'Contact'],
  '/dashboard/settings': ['SECTION 12', 'Settings'],
  '/dashboard/tickets?newTicketPanel=open': ['SECTION 11', 'Tickets'],
  '/dashboard/user-management?inviteUserPanel=open': ['SECTION 9', 'User Management'],
  '/privacy': ['SECTION 13', 'Legal', 'Privacy'],
  '/terms': ['SECTION 13', 'Legal', 'Terms']
};

/**
 * Pick guideline rules for the current page.
 */
const getRelevantRulesForPage = (pageUrl, parsedGuidelines) => {
  const mappedKeys = routeToSectionMap[pageUrl] || [];
  const relevant = parsedGuidelines.filter(rule => {
    const refUpper = (rule.guideline_reference || '').toUpperCase();
    if (refUpper.includes('APPENDIX')) return true; // Keep Appendix references globally
    return mappedKeys.some(key => refUpper.includes(key.toUpperCase()));
  });
  return relevant.length > 0 ? relevant : parsedGuidelines;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const screenshotPathForRoute = (pageUrl) => {
  const filename = pageUrl
    .replace(/\?/g, '_')
    .replace(/=/g, '_')
    .replace(/\//g, '_')
    .replace(/^_/, '') || 'home';
  return `public/screenshots/${filename}.png`;
};

/**
 * Retry API calls when the provider is busy or rate limited.
 */
const executeWithRetry = async (apiCallFn, retries = 5, initialDelayMs = 5000) => {
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCallFn();
    } catch (err) {
      const isRateLimitOrServerErr = err.status === 429 || (err.status >= 500 && err.status < 600);
      const isNetworkError = err.name === 'TypeError' || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('fetch');

      if ((isRateLimitOrServerErr || isNetworkError) && attempt < retries) {
        console.warn(`[AI AGENT] API call failed (Attempt ${attempt}/${retries}): ${err.message || err}. Retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
};

/**
 * Compare scraped UI elements with PDF rules.
 */
export const compareUIWithGuidelines = async (extractedElements, parsedGuidelines) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('API key is missing in your environment variables.');
  }

  console.log('[AI AGENT] Starting compliance audit checks...');

  // Group UI elements by page.
  const elementsByPage = {};
  for (const el of extractedElements) {
    const page = el.page_url || '/unknown';
    if (!elementsByPage[page]) {
      elementsByPage[page] = [];
    }
    elementsByPage[page].push(el);
  }

  // Batch pages to keep API calls smaller.
  const batches = [
    {
      name: 'Public Pages & Login',
      pages: ['/', '/privacy', '/terms', '/login']
    },
    {
      name: 'Waiver Workspace & Settings',
      pages: [
        '/dashboard',
        '/dashboard/my-applications',
        '/dashboard/my-applications?newApplicationPanel=open',
        '/dashboard/tickets',
        '/dashboard/tickets?newTicketPanel=open',
        '/dashboard/contact',
        '/dashboard/settings'
      ]
    },
    {
      name: 'Admin Management & Logs',
      pages: [
        '/dashboard/facilities',
        '/dashboard/action-items',
        '/dashboard/user-management',
        '/dashboard/user-management?inviteUserPanel=open',
        '/dashboard/announcements',
        '/dashboard/faqs'
      ]
    }
  ];

  // Put unknown pages in the first batch.
  const allKnownPages = new Set(batches.flatMap(b => b.pages));
  for (const page of Object.keys(elementsByPage)) {
    if (!allKnownPages.has(page)) {
      batches[0].pages.push(page);
    }
  }

  // Start with all scraped elements, then mark AI-reported mismatches.
  const finalReportItems = [];
  for (const el of extractedElements) {
    finalReportItems.push({
      page_url: el.page_url || '/unknown',
      component_type: el.component_type || 'unclassified',
      component_selector: el.component_selector || 'unknown-selector',
      actual_text_content: el.actual_text_content || null,
      expected_text_content: null,
      guideline_reference: 'General Verification Baseline',
      discrepancy_flag: false,
      discrepancy_reason: null,
      screenshot_path: null,
      retrieved_at: new Date()
    });
  }

  const systemPrompt = `You are an expert Documentation Compliance AI Agent. Your objective is to verify if a live web application's extracted UI elements match its official design and functional guideline rules.

Analyze the provided inputs:
1. Live Extracted UI Elements: Current live state of elements on these pages.
2. Relevant Guideline Rules: Verbatim behavioral expectations and matching documentation metrics.

Cross-examine each UI element against the guidelines. If an element's text deviates from what the manual dictates, or if critical functional details display discrepancies, generate a discrepancy record.

CRITICAL INSTRUCTION: You must ONLY return elements that have compliance discrepancies (where discrepancy_flag is true). Do NOT include compliant elements in the returned JSON. If all elements are fully compliant, return an empty array [].

You MUST return a valid JSON array matching this exact canonical schema:
[
  {
    "page_url": "String",
    "component_selector": "String",
    "expected_text_content": "String or null",
    "guideline_reference": "String referencing specific sections or manual anchors",
    "discrepancy_reason": "Clear explanation of why it doesn't match"
  }
]

Do not append any Markdown ticks (\`\`\`), conversational explanations, or extra filler objects. Return ONLY the raw executable JSON text array.`;

  for (const batch of batches) {
    const batchElements = [];
    const batchGuidelines = [];
    const batchPages = batch.pages.filter(p => elementsByPage[p]);

    if (batchPages.length === 0) continue;

    console.log(`[AI AGENT] Auditing Batch [${batch.name}] containing views: ${batchPages.join(', ')}`);

    for (const pageUrl of batchPages) {
      batchElements.push(...elementsByPage[pageUrl]);
      batchGuidelines.push(...getRelevantRulesForPage(pageUrl, parsedGuidelines));
    }

    const userMessage = `### Relevant Page Guidelines ###\n${JSON.stringify(batchGuidelines, null, 2)}\n\n### Live Page UI Components ###\n${JSON.stringify(batchElements, null, 2)}`;

    let batchDiscrepancies = [];

    if (process.env.GEMINI_API_KEY) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      try {
        const response = await executeWithRetry(async () => {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });
          if (!res.ok) {
            const err = new Error(`Gemini API Error: ${res.statusText}`);
            err.status = res.status;
            throw err;
          }
          return res.json();
        });

        let rawText = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          rawText = rawText.trim();
          if (rawText.startsWith('```')) {
            rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          }
          batchDiscrepancies = JSON.parse(rawText);
        }
      } catch (apiErr) {
        console.error(`[AI AGENT] Gemini API call failed for batch ${batch.name} after retries: ${apiErr.message}`);
        throw apiErr;
      }
    } else {
      const endpoint = 'https://api.openai.com/v1/chat/completions';
      
      try {
        const response = await executeWithRetry(async () => {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ]
            })
          });
          if (!res.ok) {
            const err = new Error(`OpenAI API Error: ${res.statusText}`);
            err.status = res.status;
            throw err;
          }
          return res.json();
        });

        const rawText = response.choices?.[0]?.message?.content;
        const dataJson = JSON.parse(rawText);
        batchDiscrepancies = Array.isArray(dataJson) ? dataJson : (dataJson.discrepancies || dataJson.reports || []);
      } catch (apiErr) {
        console.error(`[AI AGENT] OpenAI API call failed for batch ${batch.name} after retries: ${apiErr.message}`);
        throw apiErr;
      }
    }

    // Merge AI mismatches into the full report.
    if (Array.isArray(batchDiscrepancies)) {
      console.log(`[AI AGENT] Batch [${batch.name}] audit finished. Found ${batchDiscrepancies.length} discrepancy items.`);
      for (const disc of batchDiscrepancies) {
        const match = finalReportItems.find(item => 
          item.page_url === disc.page_url && 
          item.component_selector === disc.component_selector
        );
        if (match) {
          match.discrepancy_flag = true;
          match.discrepancy_reason = disc.discrepancy_reason;
          match.expected_text_content = disc.expected_text_content || null;
          match.guideline_reference = disc.guideline_reference || 'General Verification Baseline';
          match.screenshot_path = screenshotPathForRoute(disc.page_url);
        }
      }
    }

    // Pause between batches to avoid rate limits.
    await sleep(8000);
  }

  console.log(`[AI AGENT] Comparison successfully completed. Checked ${finalReportItems.length} total elements.`);
  return finalReportItems;
};
