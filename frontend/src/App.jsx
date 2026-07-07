import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import GroupDashboard from './components/GroupDashboard';
import GroupDetail from './components/GroupDetail';
import { Wallet } from 'lucide-react';

import CSVProcessingWizard from './components/CSVProcessingWizard';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

const Layout = ({ children }) => {
  const { user, logout } = useContext(AuthContext);
  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-indigo-900 selection:text-indigo-100 relative overflow-x-hidden">
        {/* Background Mesh Gradient Accents */}
        <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-40 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-40 left-20 w-96 h-96 bg-emerald-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

        <header className="bg-white/5 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600/20 border border-indigo-500/30 p-2 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                        <Wallet className="w-5 h-5 text-indigo-400" />
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
                        FairShare SaaS
                    </span>
                </div>
                {user && (
                    <div className="flex items-center gap-6">
                        <span className="text-sm font-medium text-slate-300">{user.email}</span>
                        <button onClick={logout} className="text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors drop-shadow-[0_0_5px_rgba(251,113,133,0.3)]">Logout</button>
                    </div>
                )}
            </div>
        </header>

        <main className="p-4 sm:p-8 relative z-10">
            <div className="max-w-7xl mx-auto">
                {children}
            </div>
        </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/" element={<ProtectedRoute><Layout><GroupDashboard /></Layout></ProtectedRoute>} />
                <Route path="/group/:groupId" element={<ProtectedRoute><Layout><GroupDetail /></Layout></ProtectedRoute>} />
                <Route path="/import" element={<ProtectedRoute><Layout><CSVProcessingWizard /></Layout></ProtectedRoute>} />
            </Routes>
        </Router>
    </AuthProvider>
  );
}

export default App;
