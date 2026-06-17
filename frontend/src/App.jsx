import { useState } from 'react';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const executeCompliancePipeline = async () => {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch('http://localhost:3000/api/compliance/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const result = await response.json();
      setReport(result);
    } catch (err) {
      setError(err.message || 'The compliance pipeline failed to execute.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Page container */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-slate-800 pb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Documentation Compliance Agent
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Runs a compliance check between the live app and the PDF guidelines.
            </p>
          </div>

          <div>
            <button
              onClick={executeCompliancePipeline}
              disabled={loading}
              className={`w-full md:w-auto flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg text-sm font-semibold tracking-wide shadow-lg shadow-indigo-500/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${loading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]'
                }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Running compliance check...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span>Run Compliance Check</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Error message */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex gap-3 items-start">
            <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-bold block text-sm">Error</span>
              <p className="text-xs mt-0.5 text-rose-400/80">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="mb-8 p-6 rounded-2xl bg-slate-800/40 border border-slate-800 flex flex-col items-center justify-center text-center py-16 animate-pulse">
            <div className="relative mb-4">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Running compliance check</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
              Parsing guidelines, logging in, visiting pages, and collecting visible UI text.
            </p>
          </div>
        )}

        {/* Report output */}
        {report && (
          <main className="space-y-8">

            {/* Summary cards */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Checked DOM Elements</span>
                <span className="text-3xl font-black text-slate-100 block mt-1">{report.summary?.total_items_checked || 0}</span>
              </div>
              <div className={`border rounded-xl p-5 transition-all ${report.summary?.discrepancies_found > 0
                ? 'bg-rose-500/5 border-rose-500/20 text-rose-400'
                : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                }`}>
                <span className="text-xs font-semibold uppercase tracking-wider block">Mismatches Found</span>
                <span className="text-3xl font-black block mt-1">{report.summary?.discrepancies_found ?? 0}</span>
              </div>
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 sm:col-span-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Match Rate</span>
                <span className="text-3xl font-black text-slate-100 block mt-1">
                  {report.summary?.total_items_checked
                    ? Math.round(((report.summary.total_items_checked - report.summary.discrepancies_found) / report.summary.total_items_checked) * 100)
                    : 100}%
                </span>
              </div>
            </section>

            {/* Results table */}
            <section>
              <h2 className="text-lg font-bold tracking-tight text-slate-200 mb-4">Compliance Results</h2>
              <div className="w-full overflow-hidden border border-slate-800 rounded-xl bg-slate-900/50 backdrop-blur-sm">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[930px] table-fixed divide-y divide-slate-800 text-left text-xs">
                    <thead className="bg-slate-800/70 text-slate-300 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-3 w-[180px]">Route</th>
                        <th className="px-3 py-3 w-[150px]">Component</th>
                        <th className="px-3 py-3 w-[180px]">Actual</th>
                        <th className="px-3 py-3 w-[180px]">Expected</th>
                        <th className="px-3 py-3 w-[240px]">Status & AI Analysis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-transparent">
                      {report.data?.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`transition-colors duration-150 ${item.discrepancy_flag
                            ? 'bg-rose-500/[0.02] hover:bg-rose-500/[0.04]'
                            : 'hover:bg-slate-800/30'
                            }`}
                        >
                          {/* Route path */}
                          <td className="px-3 py-3 align-top w-[180px]">
                            <span
                              className="block font-mono text-indigo-400 text-[10px] break-all font-medium"
                              title={item.page_url}
                            >
                              {item.page_url}
                            </span>
                          </td>

                          {/* Component type + selector */}
                          <td className="px-3 py-3 align-top w-[150px]">
                            <span className="block font-semibold text-slate-200 capitalize mb-0.5 text-[11px]">
                              {item.component_type?.replace(/_/g, ' ')}
                            </span>
                            <code className="text-[10px] text-slate-500 font-mono bg-slate-800/60 px-1 py-0.5 rounded border border-slate-700/50 block truncate max-w-fit" title={item.component_selector}>
                              {item.component_selector}
                            </code>
                          </td>

                          {/* Actual text */}
                          <td className={`px-3 py-3 align-top w-[180px] font-medium break-words ${item.discrepancy_flag ? 'text-rose-400' : 'text-emerald-400'}`}>
                            <p className="line-clamp-3 leading-relaxed text-[11px] break-words">
                              {item.actual_text_content || <span className="text-slate-600 italic font-normal">-</span>}
                            </p>
                          </td>

                          {/* Expected text */}
                          <td className="px-3 py-3 align-top w-[180px] text-slate-300 leading-relaxed break-words">
                            <p className="line-clamp-3 text-[11px] break-words">
                              {item.expected_text_content || <span className="text-slate-600 italic">-</span>}
                            </p>
                          </td>

                          {/* Status and reason */}
                          <td className="px-3 py-3 align-top w-[240px]">
                            {item.discrepancy_flag ? (
                              <div className="space-y-2 border border-rose-500/20 bg-rose-500/[0.03] p-2.5 rounded-lg ring-1 ring-rose-500/10">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 uppercase tracking-widest">
                                  <svg className="w-1.5 h-1.5 fill-rose-400 shrink-0" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                                  Discrepancy
                                </span>
                                <div className="text-slate-300 text-[11px] leading-relaxed space-y-1">
                                  <p className="font-medium text-rose-300 break-words line-clamp-4">{item.discrepancy_reason}</p>
                                  {item.guideline_reference && (
                                    <p className="text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/80">
                                      Source: {item.guideline_reference}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 uppercase tracking-widest">
                                <svg className="w-1.5 h-1.5 fill-emerald-400 shrink-0" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                                Verified
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </main>
        )}

      </div>
    </div>
  );
}

