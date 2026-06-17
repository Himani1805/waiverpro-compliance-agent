import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ComplianceReport from '../src/models/complianceModel.js';
import { parseGuidelines } from '../src/services/pdfService.js';
import { extractUIState } from '../src/services/scraperService.js';
import { compareUIWithGuidelines } from '../src/services/agentService.js';
import { computeCoverage } from '../src/utils/coverageUtils.js';

// Load environment variables.
dotenv.config();

const runAudit = async () => {
  let exitCode = 0;

  console.log('========================================================');
  console.log('WAIVERPRO COMPLIANCE AUDIT');
  console.log('========================================================');

  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('[-] Error: MONGO_URI is missing in the environment configuration.');
    process.exit(1);
  }

  // Connect to MongoDB.
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[+] Connected successfully to MongoDB.');
  } catch (dbErr) {
    console.error(`[-] MongoDB connection failed: ${dbErr.message}`);
    process.exit(1);
  }

  try {
    const pdfPath = path.join(process.cwd(), 'WaiverPro-User-Guidelines-WITH-DISCREPANCIES.pdf');

    // 1. Parse PDF guidelines.
    console.log('\n[STAGE 1] Ingesting and parsing PDF user guidelines...');
    const parsedGuidelines = await parseGuidelines(pdfPath);
    console.log(`[+] Loaded ${parsedGuidelines.length} reference rules.`);

    // 2. Scrape UI elements.
    console.log('\n[STAGE 2] Launching browser scraper & capturing screenshots...');
    const extractedUIElements = await extractUIState();
    console.log(`[+] Scraped ${extractedUIElements.length} unique elements from target pages.`);

    // Create output folder if needed.
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(publicDir, 'extracted_ui_state.json'),
      JSON.stringify(extractedUIElements, null, 2),
      'utf-8'
    );
    console.log('[+] Saved extracted UI state to: public/extracted_ui_state.json');

    // 3. Compare with AI.
    console.log('\n[STAGE 3] Running AI agent comparison loop...');
    const complianceReportItems = await compareUIWithGuidelines(extractedUIElements, parsedGuidelines);
    const discrepancyCount = complianceReportItems.filter(item => item.discrepancy_flag).length;
    console.log(`[+] AI compared elements. Identified ${discrepancyCount} discrepancies.`);

    fs.writeFileSync(
      path.join(publicDir, 'compliance_report.json'),
      JSON.stringify(complianceReportItems, null, 2),
      'utf-8'
    );
    console.log('[+] Saved discrepancy report to: public/compliance_report.json');

    // 4. Save records in MongoDB.
    console.log('\n[STAGE 4] Persisting compliance data in MongoDB...');
    await ComplianceReport.deleteMany({});
    const savedRecords = await ComplianceReport.insertMany(complianceReportItems);
    console.log(`[+] Database populated with ${savedRecords.length} records.`);

    // 5. Save coverage report.
    console.log('\n[STAGE 5] Computing compliance metrics & coverage...');
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
    console.log('[+] Saved coverage report to: public/coverage_report.json');

    // Print summary.
    console.log('\n========================================================');
    console.log('COMPLIANCE AUDIT SUMMARY');
    console.log('========================================================');
    console.table({
      'Total PDF Reference Rules': parsedGuidelines.length,
      'Total Live Scraped Elements': extractedUIElements.length,
      'Verified Compliant Elements': savedRecords.length - activeDiscrepancies.length,
      'Mismatches/Discrepancies Found': activeDiscrepancies.length,
      'Expected Guideline Views': totalExpected,
      'Scraped Guideline Views': matched.length,
      'Coverage Completeness Rate': `${percent}%`
    });

    if (activeDiscrepancies.length > 0) {
      console.log('\nDISCREPANCY ALERT: Live app deviates from guidelines on:');
      const uniqueMismatchPages = [...new Set(activeDiscrepancies.map(d => d.page_url))];
      uniqueMismatchPages.forEach(p => console.log(`  - ${p}`));
      console.log('\nVerify details at: public/compliance_report.json');
    } else {
      console.log('\nSUCCESS: 100% compliant with the guidelines!');
    }
    console.log('========================================================\n');

  } catch (err) {
    exitCode = 1;
    console.error(`[-] Audit pipeline execution crash: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    console.log('[+] Disconnected from database. Audit run finished.');
    process.exit(exitCode);
  }
};

runAudit();

