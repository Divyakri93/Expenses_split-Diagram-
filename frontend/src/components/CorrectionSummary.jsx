import React from 'react';
import { Download, Database, CheckCircle, ArrowRight } from 'lucide-react';

const CorrectionSummary = ({ processedRows, onCommit, onDownload }) => {
    // Collect all rows that had issues (warnings/errors/anomalies)
    const correctedRows = processedRows.filter(r => r.warnings.length > 0 || r.errors.length > 0 || r.data.anomaly || r.status !== 'ok');

    return (
        <div className="max-w-4xl mx-auto mt-8 relative z-10">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">Correction Ledger View</h2>
                <p className="mt-2 text-slate-400">All detected anomalies have been resolved. Review your final corrections before committing.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-6 mb-8 overflow-y-auto max-h-[50vh] custom-scrollbar">
                {correctedRows.length === 0 ? (
                    <div className="text-center text-slate-400 py-10">No anomalies were found in this dataset. It is perfectly clean!</div>
                ) : (
                    <div className="space-y-4">
                        {correctedRows.map((row, idx) => (
                            <div key={idx} className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                    <span className="font-bold text-sky-400">Row #{row.data.original_index + 1}</span>
                                    <span className="text-xs font-semibold text-emerald-400 flex items-center bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                        <CheckCircle className="w-3 h-3 mr-1" /> {row.rejected ? 'Rejected' : 'Corrected'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-1">Original Issue(s)</h4>
                                        <ul className="text-sm text-slate-300 list-disc pl-4 space-y-1">
                                            {row.errors.map((e, i) => <li key={`e-${i}`} className="text-rose-400">{e}</li>)}
                                            {row.warnings.map((w, i) => <li key={`w-${i}`} className="text-amber-400">{w}</li>)}
                                            {row.data.anomaly && <li className="text-purple-400">{row.data.anomaly.message}</li>}
                                            {row.errors.length === 0 && row.warnings.length === 0 && !row.data.anomaly && <li>Manual intervention</li>}
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-1">Changes Applied</h4>
                                        <ul className="text-sm text-sky-300 list-disc pl-4 space-y-1">
                                            {row.changes_applied && row.changes_applied.length > 0 ? (
                                                row.changes_applied.map((change, i) => <li key={`c-${i}`}>{change}</li>)
                                            ) : (
                                                <li className="text-slate-500 italic">No structural changes recorded</li>
                                            )}
                                        </ul>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-1">Final Resolution Action</h4>
                                        <div className="flex items-center text-sm text-white font-medium bg-white/5 p-2 rounded border border-white/5">
                                            <ArrowRight className="w-4 h-4 mr-2 text-sky-400" />
                                            {row.rejected ? 'Row permanently excluded.' : 'Accepted into database transaction queue.'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-center gap-6">
                <button 
                    onClick={onDownload}
                    className="inline-flex items-center px-6 py-3 border border-sky-500/50 text-sm font-bold rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.2)] text-sky-400 bg-sky-900/30 hover:bg-sky-800/40 transition-all backdrop-blur-md"
                >
                    <Download className="h-5 w-5 mr-2" /> Download Clean CSV
                </button>
                <button 
                    onClick={onCommit}
                    className="inline-flex items-center px-8 py-3 border border-transparent text-sm font-bold rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.5)] text-white bg-sky-600 hover:bg-sky-500 transition-all"
                >
                    <Database className="h-5 w-5 mr-2" /> Commit to PostgreSQL
                </button>
            </div>
        </div>
    );
};

export default CorrectionSummary;
