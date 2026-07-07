import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, AlertCircle, CheckCircle2, AlertTriangle, FileUp, Save } from 'lucide-react';
import clsx from 'clsx';

import CorrectionSummary from './CorrectionSummary';

const getCurrencySymbol = (code) => {
    const symbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'SGD': 'S$',
        'AUD': 'A$',
        'AED': 'د.إ',
        'CAD': 'C$',
        'INR': '₹'
    };
    return symbols[code] || code;
};

const CSVProcessingWizard = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processedRows, setProcessedRows] = useState([]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [editingPaidBy, setEditingPaidBy] = useState({});
  const [editingCurrency, setEditingCurrency] = useState({});

  const handleDownloadCleanCSV = () => {
      // Very simple CSV generator for the clean rows
      const validRows = processedRows.filter(r => r.status !== 'error' && !r.rejected).map(r => r.data);
      if (validRows.length === 0) return alert('No valid rows to download.');
      
      const headers = ['description', 'amount', 'paid_by', 'date', 'split_type'];
      const csvContent = "data:text/csv;charset=utf-8," 
          + headers.join(',') + '\n'
          + validRows.map(r => {
              const amount = r.base_amount || r.amount || 0;
              return `"${r.description}","${amount}","${r.paid_by}","${r.date}","${r.split_type}"`;
          }).join('\n');
          
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "clean_expenses_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleUpdatePaidBy = (index, value) => {
      const newRows = [...processedRows];
      const row = newRows[index];
      row.data.paid_by = value;
      
      row.errors = row.errors.filter(e => e !== 'Missing paid_by');
      
      if (!row.changes_applied) row.changes_applied = [];
      row.changes_applied.push(`Paid By updated to: ${value}`);

      if (row.errors.length === 0) {
          row.status = row.warnings.length > 0 ? 'warning' : 'ok';
      }
      
      setProcessedRows(newRows);
      setEditingPaidBy({ ...editingPaidBy, [index]: false });
  };

  const handleUpdateCurrency = (index, newValue) => {
      const newRows = [...processedRows];
      const row = newRows[index];
      
      const currency = newValue.toUpperCase().trim();
      row.data.currency = currency;
      
      let exchangeRate = 1.0;
      const rates = { 'USD': 95.11, 'EUR': 102.50, 'GBP': 120.00, 'SGD': 70.00, 'AUD': 62.00, 'AED': 25.90, 'CAD': 69.50, 'INR': 1.00 };
      
      if (currency && currency !== 'INR') {
          if (rates[currency]) {
              exchangeRate = rates[currency];
              row.data.base_amount = parseFloat((row.data.amount * exchangeRate).toFixed(2));
              row.data.exchange_rate_to_base = exchangeRate;
          } else {
              row.data.base_amount = row.data.amount;
              row.data.exchange_rate_to_base = 1.0;
          }
      } else {
          row.data.base_amount = row.data.amount;
          row.data.exchange_rate_to_base = 1.0;
      }
      
      row.errors = row.errors.filter(e => !e.startsWith('Missing currency'));
      
      if (!row.changes_applied) row.changes_applied = [];
      row.changes_applied.push(`Currency updated to: ${currency} (Exchange Rate: ${exchangeRate})`);

      row.status = row.errors.length > 0 ? 'error' : (row.warnings.length > 0 ? 'warning' : 'ok');
      setProcessedRows(newRows);
      setEditingCurrency({ ...editingCurrency, [index]: false });
  };

  const handleUpdateSplitPercentage = (index, memberName, newValue) => {
      const newRows = [...processedRows];
      const row = newRows[index];
      
      const newRaw = { ...row.data.raw_split_details };
      newRaw[memberName] = newValue;
      row.data.raw_split_details = newRaw;
      
      let total = 0;
      for (let k in newRaw) {
          total += parseFloat(newRaw[k]) || 0;
      }
      
      row.warnings = row.warnings.filter(w => !w.startsWith('Percentages sum to'));
      row.errors = row.errors.filter(e => !e.startsWith('Invalid split_details format'));
      
      if (Math.abs(total - 100) > 0.01) {
          row.warnings.push(`Percentages sum to ${total.toFixed(2)}%. Normalized to 100%.`);
          const normalized = {};
          for (let k in newRaw) {
             const val = parseFloat(newRaw[k]) || 0;
             normalized[k] = total > 0 ? parseFloat(((val / total) * 100).toFixed(2)) : 0;
          }
          row.data.parsed_split_details = normalized;
      } else {
          row.data.parsed_split_details = { ...newRaw };
      }
      
      if (!row.changes_applied) row.changes_applied = [];
      if (!row.changes_applied.includes(`Manual split adjustment applied`)) {
          row.changes_applied.push(`Manual split adjustment applied`);
      }

      row.status = row.errors.length > 0 ? 'error' : (row.warnings.length > 0 ? 'warning' : 'ok');
      setProcessedRows(newRows);
  };

  const handleResolveAnomaly = (index, selectedSplit = null) => {
      const newRows = [...processedRows];
      const row = newRows[index];
      
      const anomaly = row.data.anomaly;
      if (anomaly) {
          row.data.split_type = 'percentage';
          const resolvedSplit = selectedSplit || anomaly.suggested_split;
          row.data.raw_split_details = { ...resolvedSplit };
          row.data.parsed_split_details = { ...resolvedSplit };
          
          row.warnings = row.warnings.filter(w => !w.startsWith('Temporal violation:'));
          row.data.anomaly = null;
          
          if (!row.changes_applied) row.changes_applied = [];
          row.changes_applied.push(selectedSplit ? `Reverted to Original Split: ${Object.entries(selectedSplit).map(([n,p])=>`${n}:${p}%`).join(', ')}` : `Applied Smart Fix: ${Object.entries(resolvedSplit).map(([n,p])=>`${n}:${p}%`).join(', ')}`);

          row.status = row.errors.length > 0 ? 'error' : (row.warnings.length > 0 ? 'warning' : 'ok');
          setProcessedRows(newRows);
      }
  };

  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1
  });

  const handleProcess = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/expenses/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProcessedRows(res.data.rows);
      if(res.data.rows.length > 0) setActiveRowIndex(0);
    } catch (err) {
      console.error('Upload failed', err);
      // Fallback Demo Data if Backend isn't fully running yet
      setProcessedRows([
        {
          status: 'warning',
          data: { original_index: 0, description: 'Dinner at Marina Bites', amount: 1200, paid_by: 'Aisha', date: '2026-02-08', split_type: 'equal' },
          warnings: ['Possible duplicate of row 5'],
          errors: []
        },
        {
          status: 'error',
          data: { original_index: 1, description: 'Groceries', amount: null, paid_by: null, date: '2026-02-10' },
          warnings: [],
          errors: ['Missing paid_by', 'Invalid amount format']
        },
        {
          status: 'ok',
          data: { original_index: 2, description: 'Uber', base_amount: 350, amount: 350, paid_by: 'Rohan', date: '2026-02-11', split_type: 'equal' },
          warnings: [],
          errors: []
        }
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    try {
      const validRows = processedRows.filter(r => r.status !== 'error' && !r.rejected);
      const res = await axios.post('/api/expenses/commit', {
        fileName: file ? file.name : 'Unknown File',
        rows: validRows
      });
      alert('Successfully committed data!');
      setProcessedRows([]);
      setFile(null);
      if (res.data.groupId) {
          navigate(`/group/${res.data.groupId}?tab=audit`);
      }
    } catch (err) {
      console.error(err);
      alert('Commit failed or backend not reachable. Check console.');
    }
  };

  const handleAction = (index, action) => {
    const updated = [...processedRows];
    if (action === 'accept') {
      updated[index].status = 'ok';
    } else if (action === 'reject') {
      updated[index].rejected = true;
      updated[index].status = 'ignored';
    }
    setProcessedRows(updated);
    if(index < updated.length - 1) setActiveRowIndex(index + 1);
  };

  if (processedRows.length > 0) {
    if (activeRowIndex >= processedRows.length) {
        return <CorrectionSummary 
            processedRows={processedRows} 
            onCommit={handleCommit} 
            onDownload={handleDownloadCleanCSV} 
        />;
    }

    const activeRow = processedRows[activeRowIndex];
    return (
      <div className="h-[calc(100vh-8rem)] min-h-[600px] flex flex-col relative z-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">Data Review (Anomaly Stream)</h1>
          <button onClick={handleCommit} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-[0_0_15px_rgba(56,189,248,0.5)] text-white bg-sky-500 hover:bg-sky-400 transition-all">
            <Save className="h-4 w-4 mr-2" /> Commit Valid Rows
          </button>
        </div>

        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left Panel: List of rows */}
          <div className="w-1/3 bg-white/5 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 overflow-y-auto custom-scrollbar">
            <ul className="divide-y divide-white/10">
              {processedRows.map((row, idx) => (
                <li 
                  key={idx} 
                  onClick={() => setActiveRowIndex(idx)}
                  className={clsx(
                    "p-4 cursor-pointer hover:bg-white/10 transition-colors border-l-4",
                    activeRowIndex === idx ? "bg-white/10 border-sky-400 shadow-[inset_0_0_20px_rgba(56,189,248,0.2)]" : "border-transparent",
                    row.rejected ? "opacity-30" : ""
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="truncate pr-4">
                      <span className="font-semibold text-sm text-slate-200 block truncate">{row.data.description || 'Unnamed Expense'}</span>
                      <span className="text-xs text-slate-400">{row.data.date} • {row.data.currency && row.data.currency !== 'INR' ? `${getCurrencySymbol(row.data.currency)}${row.data.amount}` : `₹${row.data.amount || row.data.base_amount || 0}`}</span>
                    </div>
                    <div>
                      {row.status === 'ok' && <CheckCircle2 className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />}
                      {row.status === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />}
                      {row.status === 'error' && <AlertCircle className="h-5 w-5 text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right Panel: Active Row Details */}
          <div className="w-2/3 bg-white/5 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-8 flex flex-col overflow-y-auto custom-scrollbar">
            {activeRow ? (
              <>
                <div className="border-b border-white/10 pb-4 mb-6 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{activeRow.data.description || 'N/A'}</h2>
                    <p className="text-sm text-slate-400">Row #{activeRow.data.original_index + 1}</p>
                  </div>
                  <div className="flex flex-col items-end">
                      {activeRow.data.currency && activeRow.data.currency !== 'INR' ? (
                          <>
                             <span className="text-3xl font-extrabold text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                               {getCurrencySymbol(activeRow.data.currency)}{activeRow.data.amount} = ₹{activeRow.data.base_amount}
                             </span>
                             <span className="text-sm font-medium text-sky-300 mt-1 drop-shadow-[0_0_5px_rgba(56,189,248,0.3)]">
                               1 {getCurrencySymbol(activeRow.data.currency)} = ₹{activeRow.data.exchange_rate_to_base}
                             </span>
                          </>
                      ) : (
                         <span className="text-3xl font-extrabold text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                           ₹{activeRow.data.base_amount || activeRow.data.amount || '0.00'}
                         </span>
                      )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Paid By</label>
                    {(!activeRow.data.paid_by || editingPaidBy[activeRowIndex]) ? (
                        <div className="flex gap-2">
                            <input 
                               type="text" 
                               placeholder="Enter name..."
                               autoFocus
                               className="w-full text-sm font-semibold text-white border border-sky-500/50 bg-black/30 p-2 rounded focus:ring-2 focus:ring-sky-500 outline-none placeholder-slate-500"
                               onKeyDown={(e) => {
                                   if (e.key === 'Enter' && e.target.value.trim()) {
                                       handleUpdatePaidBy(activeRowIndex, e.target.value.trim());
                                   }
                               }}
                               onBlur={(e) => {
                                   if (e.target.value.trim()) {
                                       handleUpdatePaidBy(activeRowIndex, e.target.value.trim());
                                   } else {
                                       setEditingPaidBy({ ...editingPaidBy, [activeRowIndex]: false });
                                   }
                               }}
                            />
                        </div>
                    ) : (
                        <div className="text-sm font-semibold text-white bg-white/10 p-2 rounded flex justify-between items-center group cursor-pointer border border-white/5 hover:border-sky-500/50 transition-colors" onClick={() => setEditingPaidBy({ ...editingPaidBy, [activeRowIndex]: true })}>
                            <span>{activeRow.data.paid_by}</span>
                            <span className="text-xs text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                        </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Currency</label>
                    {(!activeRow.data.currency || editingCurrency[activeRowIndex]) ? (
                        <div className="flex gap-2">
                            <input 
                               type="text" 
                               placeholder="e.g. INR, USD"
                               autoFocus
                               defaultValue={activeRow.data.currency}
                               className="w-full text-sm font-semibold text-white border border-sky-500/50 bg-black/30 p-2 rounded focus:ring-2 focus:ring-sky-500 outline-none placeholder-slate-500 uppercase"
                               onKeyDown={(e) => {
                                   if (e.key === 'Enter' && e.target.value.trim()) {
                                       handleUpdateCurrency(activeRowIndex, e.target.value.trim());
                                   }
                               }}
                               onBlur={(e) => {
                                   if (e.target.value.trim()) {
                                       handleUpdateCurrency(activeRowIndex, e.target.value.trim());
                                   } else {
                                       setEditingCurrency({ ...editingCurrency, [activeRowIndex]: false });
                                   }
                               }}
                            />
                        </div>
                    ) : (
                        <div className="text-sm font-semibold text-white bg-white/10 p-2 rounded flex justify-between items-center group cursor-pointer border border-white/5 hover:border-sky-500/50 transition-colors" onClick={() => setEditingCurrency({ ...editingCurrency, [activeRowIndex]: true })}>
                            <span>{activeRow.data.currency}</span>
                            <span className="text-xs text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                        </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Date</label>
                    <div className="text-sm font-semibold text-white bg-white/10 p-2 rounded border border-white/5">{activeRow.data.date || 'Missing'}</div>
                  </div>
                </div>

                {activeRow.data.split_type === 'percentage' && activeRow.data.raw_split_details && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                       <h3 className="text-sm font-semibold text-slate-300">Percentage Split Breakdown</h3>
                       {activeRow.errors.some(e => e.includes('Invalid split_details format')) && activeRow.data.split_details && (
                          <div className="text-xs bg-rose-500/20 text-rose-300 px-2 py-1 rounded border border-rose-500/30">
                             <span className="font-medium mr-1">Original input:</span>
                             <code className="font-mono">{activeRow.data.split_details}</code>
                          </div>
                       )}
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                      {Object.entries(activeRow.data.raw_split_details).map(([name, pct], i) => (
                         <div key={name} className={clsx("flex items-center justify-between p-3", i !== 0 && "border-t border-white/5")}>
                             <span className="text-sm font-medium text-slate-300 capitalize">{name}</span>
                             <div className="flex items-center gap-4">
                               <div className="text-sm font-medium text-sky-300 bg-black/50 border border-white/5 px-3 py-1 rounded-md min-w-[80px] text-right drop-shadow-[0_0_5px_rgba(56,189,248,0.2)]">
                                  ₹{((activeRow.data.base_amount || activeRow.data.amount || 0) * ((parseFloat(pct) || 0) / 100)).toFixed(2)}
                               </div>
                               <div className="flex items-center">
                                  <input 
                                     type="number"
                                     min="0"
                                     max="100"
                                     step="0.01"
                                     value={pct}
                                     onChange={(e) => handleUpdateSplitPercentage(activeRowIndex, name, e.target.value)}
                                     className="w-20 text-right text-sm font-semibold text-white bg-black/30 border border-sky-500/50 rounded p-1 focus:ring-2 focus:ring-sky-500 outline-none"
                                  />
                                  <span className="ml-2 text-slate-400 text-sm">%</span>
                               </div>
                             </div>
                         </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeRow.errors.length > 0 && (
                  <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                    <h3 className="text-sm font-semibold text-rose-400 flex items-center mb-2"><AlertCircle className="h-4 w-4 mr-2"/> Critical Errors</h3>
                    <ul className="list-disc pl-5 text-sm text-rose-300">
                      {activeRow.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}

                {activeRow.warnings.length > 0 && (
                  <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                    <h3 className="text-sm font-semibold text-amber-400 flex items-center mb-2"><AlertTriangle className="h-4 w-4 mr-2"/> Arbitrage Protection Triggered</h3>
                    <ul className="list-disc pl-5 text-sm text-amber-300">
                      {activeRow.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                    </ul>
                  </div>
                )}

                {activeRow.data.anomaly && (
                   <div className={clsx("mb-6 rounded-lg p-4 shadow-[0_0_15px_rgba(0,0,0,0.1)] border", 
                        activeRow.data.anomaly.type === 'CONFLICTING_SPLIT' ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]" : 
                        activeRow.data.anomaly.type === 'POST_EXIT_MEMBER_BILLED' ? "bg-rose-500/10 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]" :
                        activeRow.data.anomaly.type === 'MID_MONTH_JOINER' ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]" :
                        "bg-purple-500/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                   )}>
                     <h3 className={clsx("text-sm font-semibold flex items-center mb-2 drop-shadow-md", 
                        activeRow.data.anomaly.type === 'CONFLICTING_SPLIT' ? "text-indigo-400" : 
                        activeRow.data.anomaly.type === 'POST_EXIT_MEMBER_BILLED' ? "text-rose-400" :
                        activeRow.data.anomaly.type === 'MID_MONTH_JOINER' ? "text-amber-400" :
                        "text-purple-400"
                     )}>
                        <AlertCircle className="h-4 w-4 mr-2"/> 
                        {activeRow.data.anomaly.type === 'CONFLICTING_SPLIT' ? "Conflicting Split Definitions Blocked" : 
                         "Temporal Frontier Violation Intercepted"}
                     </h3>
                     <p className={clsx("text-sm mb-4 font-medium whitespace-pre-wrap", 
                        activeRow.data.anomaly.type === 'CONFLICTING_SPLIT' ? "text-indigo-300" : 
                        activeRow.data.anomaly.type === 'POST_EXIT_MEMBER_BILLED' ? "text-rose-300" :
                        activeRow.data.anomaly.type === 'MID_MONTH_JOINER' ? "text-amber-300" :
                        "text-purple-300"
                     )}>
                        {activeRow.data.anomaly.message}
                     </p>
                     
                     {activeRow.data.anomaly.type === 'CONFLICTING_SPLIT' ? (
                        <div className="flex gap-4 mb-4">
                           <div className="flex-1 bg-black/40 rounded border border-indigo-500/20 p-3">
                              <div className="text-xs text-indigo-400 uppercase font-semibold mb-2 tracking-wider text-center">Option A: Equal Split</div>
                              <div className="space-y-1 mb-4">
                                 {Object.entries(activeRow.data.anomaly.equal_split).map(([name, pct]) => (
                                     <div key={name} className="flex justify-between text-sm">
                                        <span className="text-slate-300 capitalize">{name}</span>
                                        <span className="font-semibold text-white">₹{((activeRow.data.base_amount || activeRow.data.amount || 0) * (pct / 100)).toFixed(2)} <span className="text-slate-500 text-xs ml-1">({pct}%)</span></span>
                                     </div>
                                 ))}
                              </div>
                              <button
                                 onClick={() => handleResolveAnomaly(activeRowIndex, activeRow.data.anomaly.equal_split)}
                                 className="w-full bg-indigo-600/80 hover:bg-indigo-500 text-white font-medium py-1.5 px-3 rounded shadow-[0_0_10px_rgba(99,102,241,0.3)] transition-all text-xs"
                              >
                                 Select Equal Split
                              </button>
                           </div>
                           <div className="flex-1 bg-black/40 rounded border border-indigo-500/20 p-3">
                              <div className="text-xs text-indigo-400 uppercase font-semibold mb-2 tracking-wider text-center">Option B: Custom Split</div>
                              <div className="space-y-1 mb-4">
                                 {Object.entries(activeRow.data.anomaly.custom_split).map(([name, pct]) => (
                                     <div key={name} className="flex justify-between text-sm">
                                        <span className="text-slate-300 capitalize">{name}</span>
                                        <span className="font-semibold text-white">₹{((activeRow.data.base_amount || activeRow.data.amount || 0) * (pct / 100)).toFixed(2)} <span className="text-slate-500 text-xs ml-1">({pct}%)</span></span>
                                     </div>
                                 ))}
                              </div>
                              <button
                                 onClick={() => handleResolveAnomaly(activeRowIndex, activeRow.data.anomaly.custom_split)}
                                 className="w-full bg-indigo-600/80 hover:bg-indigo-500 text-white font-medium py-1.5 px-3 rounded shadow-[0_0_10px_rgba(99,102,241,0.3)] transition-all text-xs"
                              >
                                 Select Custom Split
                              </button>
                           </div>
                        </div>
                     ) : activeRow.data.anomaly.type === 'POST_EXIT_MEMBER_BILLED' ? (
                        <div className="flex gap-4 mb-4">
                           <div className="flex-1 bg-black/40 rounded border border-rose-500/20 p-3">
                              <div className="text-xs text-rose-400 uppercase font-semibold mb-2 tracking-wider text-center">Original State</div>
                              <div className="space-y-1 mb-4">
                                 {Object.entries(activeRow.data.anomaly.original_split).map(([name, pct]) => (
                                     <div key={name} className="flex justify-between text-sm">
                                        <span className="text-slate-300 capitalize">{name}</span>
                                        <span className={clsx("font-semibold text-white", activeRow.data.anomaly.suggested_split[name] === 0 && "text-rose-400")}>₹{((activeRow.data.base_amount || activeRow.data.amount || 0) * (pct / 100)).toFixed(2)}</span>
                                     </div>
                                 ))}
                              </div>
                           </div>
                           <div className="flex-1 bg-black/40 rounded border border-emerald-500/20 p-3">
                              <div className="text-xs text-emerald-400 uppercase font-semibold mb-2 tracking-wider text-center">Proposed Cleaned State</div>
                              <div className="space-y-1 mb-4">
                                 {Object.entries(activeRow.data.anomaly.suggested_split).map(([name, pct]) => (
                                     <div key={name} className="flex justify-between text-sm">
                                        <span className="text-slate-300 capitalize">{name}</span>
                                        <span className={clsx("font-semibold text-white", pct === 0 && "text-emerald-400")}>₹{((activeRow.data.base_amount || activeRow.data.amount || 0) * (pct / 100)).toFixed(2)}</span>
                                     </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                     ) : (
                         <>
                             <div className="bg-black/40 rounded border border-purple-500/20 p-3 mb-4">
                                <div className="text-xs text-purple-400 uppercase font-semibold mb-2 tracking-wider">Suggested Re-distribution</div>
                                <div className="space-y-1">
                                   {Object.entries(activeRow.data.anomaly.suggested_split).map(([name, pct]) => (
                                       <div key={name} className="flex justify-between text-sm">
                                          <span className="text-slate-300 capitalize">{name}</span>
                                          <span className="font-semibold text-white">{pct}%</span>
                                       </div>
                                   ))}
                                </div>
                             </div>
                         </>
                     )}

                     {activeRow.data.anomaly.type === 'POST_EXIT_MEMBER_BILLED' ? (
                        <div className="flex gap-4">
                           <button
                              onClick={() => handleResolveAnomaly(activeRowIndex)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded-lg shadow-[0_0_10px_rgba(5,150,105,0.4)] transition-all text-sm"
                           >
                              Apply Smart Fix
                           </button>
                           <button
                              onClick={() => {
                                 const newRows = [...processedRows];
                                 newRows[activeRowIndex].data.anomaly = null;
                                 setProcessedRows(newRows);
                              }}
                              className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/20 font-medium py-2 px-4 rounded-lg transition-all text-sm"
                           >
                              Manual Overwrite
                           </button>
                        </div>
                     ) : activeRow.data.anomaly.type === 'MID_MONTH_JOINER' ? (
                        <div className="flex gap-4">
                           <button
                              onClick={() => handleResolveAnomaly(activeRowIndex)}
                              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-medium py-2 px-4 rounded-lg shadow-[0_0_10px_rgba(245,158,11,0.4)] transition-all text-sm"
                           >
                              Apply Dynamic Smart Fix
                           </button>
                           <button
                              onClick={() => handleResolveAnomaly(activeRowIndex, activeRow.data.anomaly.original_split)}
                              className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/20 font-medium py-2 px-4 rounded-lg transition-all text-sm"
                           >
                              Keep Original
                           </button>
                           <button
                              onClick={() => {
                                 const newRows = [...processedRows];
                                 newRows[activeRowIndex].data.anomaly = null;
                                 setProcessedRows(newRows);
                              }}
                              className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/20 font-medium py-2 px-4 rounded-lg transition-all text-sm"
                           >
                              Manual Edit
                           </button>
                        </div>
                     ) : activeRow.data.anomaly.type !== 'CONFLICTING_SPLIT' && (
                         <button
                            onClick={() => handleResolveAnomaly(activeRowIndex)}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-lg shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-all text-sm w-full"
                         >
                            Resolve Anomaly
                         </button>
                     )}
                   </div>
                )}

                <div className="mt-auto flex gap-4 pt-4 border-t border-white/10">
                  <button 
                    disabled={activeRow.status === 'error'}
                    onClick={() => handleAction(activeRowIndex, 'accept')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(5,150,105,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Accept Record
                  </button>
                  <button 
                    onClick={() => handleAction(activeRowIndex, 'reject')}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/20 font-medium py-3 px-4 rounded-xl transition-all"
                  >
                    Reject Record
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 font-medium">Select a row to view details</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-12 relative z-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-md">Import Expenses</h1>
        <p className="mt-3 text-slate-400 text-lg">Upload your dirty CSV. The engine will clean, validate, and flag anomalies automatically.</p>
      </div>

      <div 
        {...getRootProps()} 
        className={clsx(
          "border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all backdrop-blur-md bg-white/5",
          isDragActive ? "border-sky-400 bg-sky-900/20 shadow-[0_0_30px_rgba(56,189,248,0.2)]" : "border-slate-600 hover:border-sky-500 hover:bg-white/10"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className={clsx("mx-auto h-20 w-20 mb-6 drop-shadow-lg transition-colors", isDragActive ? "text-sky-400" : "text-slate-500")} />
        {file ? (
          <p className="text-xl font-bold text-white drop-shadow-md">{file.name}</p>
        ) : (
          <div>
            <p className="text-xl font-bold text-slate-200">Drag & drop your CSV here</p>
            <p className="text-md text-slate-400 mt-2 font-medium">or click to browse</p>
          </div>
        )}
      </div>

      {file && (
        <div className="mt-10 text-center">
          <button 
            onClick={handleProcess}
            disabled={uploading}
            className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.5)] text-white bg-sky-600 hover:bg-sky-500 transition-all"
          >
            {uploading ? (
              <><div className="animate-spin mr-3 h-5 w-5 border-t-2 border-b-2 border-white rounded-full"></div> Processing Stream...</>
            ) : (
              <><FileUp className="mr-3 h-6 w-6" /> Start Validation Engine</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CSVProcessingWizard;
