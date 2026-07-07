import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, CheckCircle } from 'lucide-react';

const CSVChangesLog = ({ groupId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (groupId) {
      axios.get(`/api/expenses/${groupId}/all`)
        .then(res => {
          // Filter expenses that have [System Corrections] in their notes
          const expensesWithChanges = res.data.expenses.filter(exp => 
            exp.notes && exp.notes.includes('[System Corrections]')
          );
          setLogs(expensesWithChanges);
        })
        .catch(err => console.error("Failed to fetch expenses", err))
        .finally(() => setLoading(false));
    }
  }, [groupId]);

  if (loading) {
    return <div className="text-center py-10 text-slate-400">Loading CSV changes log...</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-lg mb-2">No System Corrections Found</p>
        <p className="text-sm">Either no CSV was imported, or no smart fixes/manual corrections were required during the import.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
         <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">CSV Import Log</h1>
         <p className="mt-2 text-sm text-slate-500">Historical record of all smart fixes and manual corrections applied during CSV processing.</p>
      </div>

      <div className="space-y-4">
        {logs.map((exp, idx) => {
          // Parse the notes to extract just the system corrections
          const notesSplit = exp.notes.split('[System Corrections]:');
          const originalNotes = notesSplit[0].trim();
          const correctionsStr = notesSplit.length > 1 ? notesSplit[1].trim() : '';
          
          // Corrections are joined by ' | ', let's split them back
          const corrections = correctionsStr.split(' | ').filter(c => c);

          return (
            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-indigo-500 mr-3" />
                  <div>
                    <h3 className="font-bold text-slate-900">{exp.description}</h3>
                    <div className="text-xs text-slate-500 mt-1">
                      {exp.date} • Paid by <span className="font-medium text-slate-700">{exp.Payer?.name || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{exp.amount} {exp.currency}</div>
                </div>
              </div>

              <div>
                 <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Corrections Applied</h4>
                 <ul className="space-y-1.5">
                   {corrections.map((corr, cIdx) => (
                     <li key={cIdx} className="text-sm text-slate-700 flex items-start">
                       <CheckCircle className="w-4 h-4 text-emerald-500 mr-2 mt-0.5 flex-shrink-0" />
                       <span className="font-medium">{corr}</span>
                     </li>
                   ))}
                 </ul>
              </div>

              {originalNotes && (
                 <div className="mt-4 pt-3 border-t border-slate-100">
                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-1">Original Notes</h4>
                    <p className="text-sm text-slate-600 italic">{originalNotes}</p>
                 </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CSVChangesLog;
