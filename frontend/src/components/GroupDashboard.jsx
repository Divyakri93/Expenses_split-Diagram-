import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Shield, UploadCloud, Trash2 } from 'lucide-react';

const GroupDashboard = () => {
  const { user } = useContext(AuthContext);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await axios.get('/api/groups');
      setGroups(res.data.groups);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/groups', { name: newGroupName, currency: newGroupCurrency });
      setShowModal(false);
      setNewGroupName('');
      fetchGroups();
    } catch (err) {
      console.error(err);
      alert('Failed to create group');
    }
  };

  const handleDeleteGroup = async (e, groupId, role) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== 'admin') {
      alert('Only admins can delete this group.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this group and all its expenses? This cannot be undone.')) {
      try {
        await axios.delete(`/api/groups/${groupId}`);
        fetchGroups();
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.error || 'Failed to delete group');
      }
    }
  };

  const handleGlobalImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/expenses/global-import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
      });
      navigate(`/group/${res.data.groupId}?tab=audit`);
    } catch (err) {
      console.error(err);
      alert('Failed to process global import.');
      setImporting(false);
    }
  };

  if (loading || importing) return (
    <div className="flex flex-col items-center justify-center mt-20 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        {importing && <p className="text-slate-500 font-medium animate-pulse">Auto-generating group & settling accounts...</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome, {user?.name}</h1>
           <p className="mt-2 text-sm text-slate-500">Select a group to manage expenses or create a new one.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4 mr-2" /> New Group
        </button>
      </div>

      {/* Global Import Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 text-indigo-100 opacity-50">
            <UploadCloud className="w-48 h-48" />
        </div>
        <div className="relative z-10">
            <h2 className="text-2xl font-bold text-indigo-900 mb-2">Interactive Import Wizard</h2>
            <p className="text-indigo-700 mb-6 max-w-2xl mx-auto">Have a raw CSV from Splitwise or a bank? Open the Wizard to parse it, flag duplicates, adjust join/leave dates, and approve records before committing.</p>
            <Link to="/import" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer transition-colors">
                <UploadCloud className="w-5 h-5 mr-2" />
                Launch Import Wizard
            </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(group => (
          <Link key={group.id} to={`/group/${group.id}`} className="block group">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 h-full flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
              <div className="flex justify-between items-start mb-4">
                 <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{group.name}</h3>
                 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    {group.currency}
                 </span>
              </div>
              <div className="mt-auto flex items-center justify-between">
                 <div className="flex items-center text-sm text-slate-500">
                    {group.role === 'admin' ? <Shield className="h-4 w-4 mr-1 text-emerald-500" /> : <Users className="h-4 w-4 mr-1" />}
                    {group.role === 'admin' ? 'Admin' : 'Member'}
                 </div>
                 {group.role === 'admin' && (
                    <button 
                       onClick={(e) => handleDeleteGroup(e, group.id, group.role)}
                       className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                       title="Delete Group"
                    >
                       <Trash2 className="h-4 w-4" />
                    </button>
                 )}
              </div>
            </div>
          </Link>
        ))}
        {groups.length === 0 && (
           <div className="col-span-full py-12 text-center text-slate-500 bg-white border border-dashed border-slate-300 rounded-2xl">
              <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              You are not a member of any groups yet. Create one to get started!
           </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                <input type="text" required value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. Goa Trip 2026" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Currency</label>
                <select value={newGroupCurrency} onChange={e => setNewGroupCurrency(e.target.value)} className="w-full rounded-lg border-slate-300 px-4 py-2 border focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDashboard;
