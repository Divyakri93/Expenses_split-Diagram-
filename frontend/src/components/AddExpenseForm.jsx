import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

const AddExpenseForm = ({ groupId, members, onExpenseAdded }) => {
  const { user } = useContext(AuthContext);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(user?.id || '');
  const [splitType, setSplitType] = useState('equal');
  const [splitWith, setSplitWith] = useState([]); // array of user IDs
  const [splitDetails, setSplitDetails] = useState({}); // { userId: val }
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     // default to all members
     if (members && members.length > 0) {
         setSplitWith(members.map(m => m.id));
         if(!paidBy) setPaidBy(members[0].id);
     }
  }, [members]);

  const handleSplitWithChange = (userId) => {
      if (splitWith.includes(userId)) {
          setSplitWith(splitWith.filter(id => id !== userId));
      } else {
          setSplitWith([...splitWith, userId]);
      }
  };

  const handleDetailChange = (userId, val) => {
      setSplitDetails({ ...splitDetails, [userId]: Number(val) });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      if(splitWith.length === 0) return alert('Select at least one person to split with.');
      
      setLoading(true);
      try {
          await axios.post(`/api/expenses/${groupId}`, {
              description,
              paid_by_user_id: paidBy,
              amount: Number(amount),
              currency,
              split_type: splitType,
              split_with: splitWith,
              split_details: splitDetails,
              date,
              notes
          });
          onExpenseAdded();
          // Reset form
          setDescription('');
          setAmount('');
          setNotes('');
      } catch (err) {
          alert(err.response?.data?.error || 'Failed to add expense');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
       <h3 className="text-xl font-bold text-slate-900 mb-6">Log New Expense</h3>
       <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input type="text" required value={description} onChange={e=>setDescription(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500" placeholder="e.g. Dinner at Taj" />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input type="date" required value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500" />
              </div>
              <div className="flex gap-2">
                  <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                      <input type="number" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500" placeholder="0.00" />
                  </div>
                  <div className="w-24">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                      <select value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full rounded-lg border-slate-300 px-2 py-2 border focus:ring-indigo-500">
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                      </select>
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paid By</label>
                  <select required value={paidBy} onChange={e=>setPaidBy(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500">
                      {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
              </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
              <label className="block text-sm font-medium text-slate-700 mb-3">Split Between</label>
              <div className="flex flex-wrap gap-3 mb-4">
                  {members.map(m => (
                      <label key={m.id} className={`inline-flex items-center px-4 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors ${splitWith.includes(m.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" className="hidden" checked={splitWith.includes(m.id)} onChange={() => handleSplitWithChange(m.id)} />
                          {m.name}
                      </label>
                  ))}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Split Type</label>
                      <select value={splitType} onChange={e=>setSplitType(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500">
                          <option value="equal">Equally</option>
                          <option value="percentage">By Percentage</option>
                          <option value="unequal">Unequally (Exact Amounts)</option>
                      </select>
                  </div>
              </div>

              {/* Dynamic Split Details UI */}
              {splitType !== 'equal' && splitWith.length > 0 && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Enter {splitType === 'percentage' ? 'Percentages' : 'Exact Amounts'}</h4>
                      {members.filter(m => splitWith.includes(m.id)).map(m => (
                          <div key={m.id} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-600">{m.name}</span>
                              <div className="relative w-32">
                                  <input 
                                      type="number" step="0.01" required 
                                      value={splitDetails[m.id] || ''} 
                                      onChange={e => handleDetailChange(m.id, e.target.value)} 
                                      className="w-full rounded-lg border-slate-300 px-3 py-1.5 border focus:ring-indigo-500 pr-8" 
                                  />
                                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                      <span className="text-slate-500 sm:text-sm">{splitType === 'percentage' ? '%' : currency}</span>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          <div>
              <button type="submit" disabled={loading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors">
                  {loading ? 'Logging...' : 'Log Expense'}
              </button>
          </div>
       </form>
    </div>
  );
};

export default AddExpenseForm;
