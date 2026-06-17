import fs from 'fs';
import pdf from 'pdf-parse';

/**
 * pdfService.js
 *
 * Reads the WaiverPro guidelines PDF and converts it into a flat list of rules.
 * Each rule is an object: { guideline_reference, expected_text_content }
 *
 * The parser tracks the current SECTION/APPENDIX heading and stores
 * useful text lines under that heading.
 */
export const parseGuidelines = async (pdfPath) => {
  console.log(`[PDF PARSER] Reading: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  // pdf-parse extracts raw text from the PDF buffer
  const { text } = await pdf(fs.readFileSync(pdfPath));

  if (!text || text.trim().length === 0) {
    console.warn('[PDF PARSER] Warning: PDF appears to be empty.');
    return [];
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rules = [];
  let currentSection = 'General Guidelines';

  for (const line of lines) {
    // Update the current section.
    if (line.toUpperCase().startsWith('SECTION') || line.toUpperCase().startsWith('APPENDIX')) {
      currentSection = line;
      continue;
    }

    // Skip non-rule text.
    if (line.toLowerCase().startsWith('figure') || line.toLowerCase().startsWith('table of contents')) {
      continue;
    }

    // Store useful text as a guideline rule.
    if (line.length > 5) {
      rules.push({ guideline_reference: currentSection, expected_text_content: line });
    }
  }

  console.log(`[PDF PARSER] Done. Parsed ${rules.length} rules.`);
  return rules;
};
