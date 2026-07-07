import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import AddExpenseForm from './AddExpenseForm';
import CSVProcessingWizard from './CSVProcessingWizard';
import AuditTrailView from './AuditTrailView';
import CSVChangesLog from './CSVChangesLog';
import ChatView from './ChatView';
import { ArrowLeft, Download, Users, UserPlus } from 'lucide-react';

const GroupDetail = () => {
    const { groupId } = useParams();
    const location = useLocation();
    const { user } = useContext(AuthContext);

    // Parse ?tab=xxx from URL
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || 'chat';

    const [groupName, setGroupName] = useState('Group');
    const [members, setMembers] = useState([]);
    const [activeTab, setActiveTab] = useState(initialTab); // chat, log, import, audit
    const [showAddMember, setShowAddMember] = useState(false);
    const [emailToAdd, setEmailToAdd] = useState('');

    useEffect(() => {
        fetchGroupDetails();
    }, [groupId]);

    const fetchGroupDetails = async () => {
        try {
            // Get user's groups to find the name (cheap way)
            const gRes = await axios.get('/api/groups');
            const grp = gRes.data.groups.find(g => g.id.toString() === groupId);
            if (grp) setGroupName(grp.name);

            // Get members
            const mRes = await axios.get(`/api/groups/${groupId}/members`);
            setMembers(mRes.data.members);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!emailToAdd) return;
        try {
            await axios.post(`/api/groups/${groupId}/members`, { email: emailToAdd });
            setShowAddMember(false);
            setEmailToAdd('');
            fetchGroupDetails();
            alert('Member added successfully!');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add member');
        }
    };

    const handleExportCSV = async () => {
        try {
            const response = await axios.get(`/api/expenses/${groupId}/export-csv`, {
                responseType: 'blob', // crucial for downloading files
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `group_expenses_${groupId}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Failed to export CSV');
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/" className="p-2 bg-white border border-slate-200 rounded-full text-slate-500 hover:bg-slate-50 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{groupName}</h1>
                        <div className="mt-1 flex items-center text-sm text-slate-500">
                            <Users className="w-4 h-4 mr-1.5" /> {members.length} Members
                            <button onClick={() => setShowAddMember(!showAddMember)} className="ml-3 text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center">
                                <UserPlus className="w-3.5 h-3.5 mr-1" /> Add Member
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleExportCSV} className="inline-flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 font-medium transition-colors shadow-sm">
                        <Download className="w-4 h-4 mr-2" /> Export CSV
                    </button>
                </div>
            </div>

            {showAddMember && (
                <form onSubmit={handleAddMember} className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-4 items-end">
                    <div className="flex-1 max-w-sm">
                        <label className="block text-sm font-medium text-indigo-900 mb-1">Enter User's Email Address</label>
                        <input
                            type="email"
                            required
                            placeholder="user@example.com"
                            value={emailToAdd}
                            onChange={e => setEmailToAdd(e.target.value)}
                            className="w-full rounded-lg border-indigo-200 px-3 py-2 border focus:ring-indigo-500"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors">Add Member</button>
                </form>
            )}

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    {['chat', 'log', 'import', 'audit', 'csv_changes'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                            {tab === 'chat' ? 'Activity Chat' : tab === 'log' ? 'Manual Logging' : tab === 'import' ? 'CSV Import Wizard' : tab === 'audit' ? 'Settlement Matrix' : 'CSV Changes Log'}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="pt-4">
                {activeTab === 'chat' && <ChatView groupId={groupId} />}
                {activeTab === 'log' && <AddExpenseForm groupId={groupId} members={members} onExpenseAdded={() => { setActiveTab('chat'); }} />}
                {activeTab === 'import' && <CSVProcessingWizard groupId={groupId} />}
                {activeTab === 'audit' && <AuditTrailView groupId={groupId} />}
                {activeTab === 'csv_changes' && <CSVChangesLog groupId={groupId} />}
            </div>
        </div>
    );
};

export default GroupDetail;
