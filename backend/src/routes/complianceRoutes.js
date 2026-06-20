import express from 'express';
import path from 'path';
import fs from 'fs';
import ComplianceReport from '../models/complianceModel.js';
import { parseGuidelines } from '../services/pdfService.js';
import { extractUIState } from '../services/scraperService.js';
import { compareUIWithGuidelines } from '../services/agentService.js';
import { computeCoverage } from '../utils/coverageUtils.js';

const router = express.Router();

const readCachedReport = () => {
  const publicDir = path.join(process.cwd(), 'public');
  const reportPath = path.join(publicDir, 'compliance_report.json');

  if (!fs.existsSync(reportPath)) {
    return null;
  }

  const reportItems = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const discrepancies = reportItems.filter(item => item.discrepancy_flag === true);

  return {
    success: true,
    cached: true,
    summary: {
      total_items_checked: reportItems.length,
      discrepancies_found: discrepancies.length,
      disclaimer: "Automated compliance check wrapper. This does not replace manual QA verification."
    },
    data: reportItems
  };
};

/**
 * Route: POST /api/compliance/run
 * Description: Runs the full compliance check pipeline step-by-step.
 */
router.post('/run', async (req, res, next) => {
  try {
    console.log('[PIPELINE] Starting compliance check process...');

    const pdfPath = path.join(process.cwd(), 'WaiverPro-User-Guidelines-WITH-DISCREPANCIES.pdf');

    // Step 1: Read and parse the guidelines PDF
    console.log('[PIPELINE] Step 1: Reading and parsing PDF guidelines...');
    const parsedGuidelines = await parseGuidelines(pdfPath);

    // Step 2: Open Puppeteer browser and scrape live website
    console.log('[PIPELINE] Step 2: Scraping UI data from the live website...');
    const extractedUIElements = await extractUIState();

    // Ensure target output directories exist
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Save Extracted UI State for reference / debug purposes
    fs.writeFileSync(
      path.join(publicDir, 'extracted_ui_state.json'),
      JSON.stringify(extractedUIElements, null, 2),
      'utf-8'
    );
    console.log('[PIPELINE] Extracted UI state data saved to public/extracted_ui_state.json');

    // Step 3: Run AI comparison to detect style/functional mismatches
    console.log('[PIPELINE] Step 3: Sending data to AI agent for comparison...');
    const complianceReportItems = await compareUIWithGuidelines(extractedUIElements, parsedGuidelines);

    // Save AI findings to disk
    fs.writeFileSync(
      path.join(publicDir, 'compliance_report.json'),
      JSON.stringify(complianceReportItems, null, 2),
      'utf-8'
    );
    console.log('[PIPELINE] Final discrepancy report saved to public/compliance_report.json');

    // Step 4: Clear previous audit data from database
    console.log('[PIPELINE] Step 4: Deleting old report logs from database...');
    await ComplianceReport.deleteMany({});

    // Step 5: Save new compliance results to MongoDB
    console.log('[PIPELINE] Step 5: Saving new compliance records to database...');
    const savedRecords = await ComplianceReport.insertMany(complianceReportItems);

    console.log('[PIPELINE] Compliance check finished successfully!');

    // Compute coverage report using shared utility
    const activeDiscrepancies = savedRecords.filter(record => record.discrepancy_flag === true);
    const scrapedRoutes = [...new Set(extractedUIElements.map(el => el.page_url))];
    const { matched, percent, totalExpected } = computeCoverage(scrapedRoutes);

    const coverageReport = {
      generated_at: new Date().toISOString(),
      summary: {
        total_pdf_rules_analyzed: parsedGuidelines.length,
        total_live_scraped_elements: extractedUIElements.length,
        verified_compliant_elements: savedRecords.length - activeDiscrepancies.length,
        mismatch_discrepancies_found: activeDiscrepancies.length,
        total_guideline_pages_expected: totalExpected,
        total_guideline_pages_scraped: matched.length,
        coverage_completeness_rate: `${percent}%`
      },
      discovered_routes: scrapedRoutes,
      details: {
        disclaimer: "Automated compliance check wrapper. This does not replace manual QA verification."
      }
    };

    fs.writeFileSync(
      path.join(publicDir, 'coverage_report.json'),
      JSON.stringify(coverageReport, null, 2),
      'utf-8'
    );
    console.log('[PIPELINE] Coverage/completeness report saved to public/coverage_report.json');

    res.status(200).json({
      success: true,
      summary: {
        total_items_checked: savedRecords.length,
        discrepancies_found: activeDiscrepancies.length,
        disclaimer: "Automated compliance check wrapper. This does not replace manual QA verification."
      },
      data: savedRecords
    });

  } catch (error) {
    console.error(`[PIPELINE] Error running the pipeline: ${error.message}`);
    const cachedReport = readCachedReport();
    if (cachedReport) {
      console.warn('[PIPELINE] Returning last generated report because live run failed.');
      return res.status(200).json(cachedReport);
    }
    next(error); // Pass to express error handler
  }
});

export default router;
