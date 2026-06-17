import mongoose from 'mongoose';

const complianceReportSchema = new mongoose.Schema(
  {
    page_url: {
      type: String,
      required: [true, 'Page URL is required to know which screen this element belongs to.'],
      trim: true,
      index: true
    },
    component_type: {
      type: String,
      required: [true, 'Component type is required to identify the element (e.g., button, link).'],
      trim: true
    },
    component_selector: {
      type: String,
      required: [true, 'Component selector is required to find the exact DOM element again.'],
      trim: true
    },
    actual_text_content: {
      type: String,
      default: null,
      trim: true
    },
    expected_text_content: {
      type: String,
      default: null,
      trim: true
    },
    guideline_reference: {
      type: String,
      default: null,
      trim: true
    },
    discrepancy_flag: {
      type: Boolean,
      required: true,
      default: false,
      index: true
    },
    discrepancy_reason: {
      type: String,
      default: null,
      trim: true
    },
    screenshot_path: {
      type: String,
      default: null,
      trim: true
    },
    retrieved_at: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'compliance_reports'
  }
);

complianceReportSchema.index({ page_url: 1, component_selector: 1, retrieved_at: -1 });

const ComplianceReport = mongoose.model('ComplianceReport', complianceReportSchema);

export default ComplianceReport;
