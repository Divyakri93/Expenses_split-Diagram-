import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, Search, FileText } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const AuditTrailView = ({ groupId }) => {
  const { user: currentUser } = useContext(AuthContext);
  const [members, setMembers] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [auditData, setAuditData] = useState({});
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groupId) {
        axios.get(`/api/groups/${groupId}/members`)
            .then(res => setMembers(res.data.members))
            .catch(err => console.error("Failed to fetch members", err));
            
        axios.get(`/api/expenses/settlements/${groupId}`)
            .then(res => setSettlements(res.data.settlements || []))
            .catch(err => console.error("Failed to fetch settlements", err));
    }
  }, [groupId]);

  const fetchAudit = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (auditData[userId]) return; // Already cached

    setLoading(true);
    try {
      const res = await axios.get(`/api/expenses/audit/${userId}`);
      setAuditData(prev => ({ ...prev, [userId]: res.data.auditTrail }));
    } catch (err) {
      console.error(err);
      setAuditData(prev => ({ ...prev, [userId]: [] }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
           <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Settlement Matrix</h1>
           <p className="mt-2 text-sm text-slate-500">Linear ledger reconstruction. See exact mathematical calculations.</p>
        </div>
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
           <input type="text" placeholder="Search flatmate..." className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
      </div>

      {/* Suggested Payments Section */}
      {settlements.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold text-indigo-900 mb-4">Who Pays Whom</h2>
            <div className="space-y-3">
                {settlements.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white px-5 py-3 rounded-xl shadow-sm">
                        <div className="flex items-center space-x-3">
                            <span className="font-semibold text-rose-600">{s.fromName}</span>
                            <span className="text-slate-400 text-sm">needs to pay</span>
                            <span className="font-semibold text-emerald-600">{s.toName}</span>
                        </div>
                        <div className="font-bold text-slate-900">
                            {s.amount.toFixed(2)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-900 mb-4">Individual Ledgers</h2>
      <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {members.map(user => {
            const isExpanded = expandedUser === user.id;
            const userLedger = auditData[user.id] || [];

            return (
              <li key={user.id} className="flex flex-col transition-all">
                <button 
                  onClick={() => fetchAudit(user.id)}
                  className={`w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                      {user.name.charAt(0)}
                    </div>
                    <span className="font-semibold text-slate-900 text-lg">
                        {user.name} {currentUser?.id === user.id && <span className="text-slate-400 text-sm font-medium ml-1">(You)</span>}
                    </span>
                  </div>
                  {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="px-6 py-6 bg-slate-50/50">
                    {loading && !auditData[user.id] ? (
                      <div className="text-center text-sm text-slate-500 py-4 flex items-center justify-center">
                        <div className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-indigo-600 rounded-full"></div> Loading ledger...
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                              <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Original Base</th>
                              <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Impact</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {userLedger.length === 0 ? (
                              <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">No transactions recorded.</td></tr>
                            ) : (
                              userLedger.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{tx.date}</td>
                                  <td className="px-6 py-4 text-sm font-medium text-slate-900 flex items-center">
                                     <FileText className="h-4 w-4 text-slate-400 mr-2" />
                                     {tx.description}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${tx.type === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                                    {tx.original_amount} {tx.currency}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">
                                    <span className={tx.impact > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                      {tx.impact > 0 ? '+' : ''}{tx.impact.toFixed(2)}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        {userLedger.length > 0 && (
                          <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Final Net Balance</span>
                            <div className="text-right">
                              {(() => {
                                const netBalance = userLedger.reduce((sum, tx) => sum + tx.impact, 0);
                                if (netBalance > 0) {
                                    return <span className="text-lg font-bold text-emerald-600">Gets back {netBalance.toFixed(2)}</span>;
                                } else if (netBalance < 0) {
                                    return <span className="text-lg font-bold text-rose-600">Owes {Math.abs(netBalance).toFixed(2)}</span>;
                                } else {
                                    return <span className="text-lg font-bold text-slate-500">Settled (0.00)</span>;
                                }
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default AuditTrailView;
