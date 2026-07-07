import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowRight, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

const DashboardView = () => {
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);

  // Group UUID hardcoded for demo. Normally fetched from auth context.
  const groupId = 'group-uuid-1234'; 

  useEffect(() => {
    // In a real app, this fetches from the backend we built.
    // However, since we might not have the DB populated immediately upon startup,
    // we will add some graceful error handling or mock data fallback.
    const fetchSettlements = async () => {
      try {
        const response = await axios.get(`/api/expenses/settlements/${groupId}`);
        setSettlements(response.data.settlements);
        setBalances(response.data.rawBalances);
      } catch (error) {
        console.error("Error fetching settlements:", error);
        // Fallback demo data if backend isn't up or DB is empty
        setSettlements([
          { fromName: 'Rohan', toName: 'Aisha', amount: 2300 },
          { fromName: 'Meera', toName: 'Priya', amount: 450.50 }
        ]);
        setBalances({
          'Rohan': -2300,
          'Aisha': 2300,
          'Meera': -450.5,
          'Priya': 450.5
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSettlements();
  }, []);

  if (loading) return <div className="flex justify-center mt-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Group Overview</h1>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(balances).map(([user, bal]) => {
          const isPositive = Number(bal) > 0;
          const isNegative = Number(bal) < 0;
          return (
            <div key={user} className="bg-white overflow-hidden shadow-sm rounded-2xl border border-slate-100 hover:shadow-md transition-shadow duration-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    {isPositive ? <TrendingUp className="h-6 w-6 text-emerald-500" /> : isNegative ? <TrendingDown className="h-6 w-6 text-rose-500" /> : <DollarSign className="h-6 w-6 text-slate-400" />}
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-slate-500 truncate">{user}</dt>
                      <dd className="flex items-baseline">
                        <span className={`text-2xl font-bold ${isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-slate-900'}`}>
                          {isPositive ? '+' : ''}₹{Math.abs(Number(bal)).toFixed(2)}
                        </span>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settlement Matrix */}
      <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg leading-6 font-semibold text-slate-900">Optimal Settlement Plan</h3>
          <p className="mt-1 text-sm text-slate-500">Minimized transactions to clear all debts.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {settlements.length === 0 ? (
             <li className="px-6 py-8 text-center text-slate-500 font-medium">All settled up! 🎉</li>
          ) : settlements.map((s, idx) => (
            <li key={idx} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center space-x-4 w-full">
                <div className="flex flex-col items-center flex-1">
                  <span className="font-semibold text-slate-700">{s.fromName}</span>
                  <span className="text-xs text-slate-400">Pays</span>
                </div>
                
                <div className="flex flex-col items-center justify-center px-4 w-32 relative">
                   <div className="h-px bg-indigo-200 w-full absolute top-1/2 -translate-y-1/2"></div>
                   <span className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-full text-sm relative z-10 shadow-sm border border-indigo-100">
                     ₹{Number(s.amount).toFixed(2)}
                   </span>
                   <ArrowRight className="h-4 w-4 text-indigo-400 absolute right-0 top-1/2 -translate-y-1/2 translate-x-1" />
                </div>

                <div className="flex flex-col items-center flex-1">
                  <span className="font-semibold text-slate-700">{s.toName}</span>
                  <span className="text-xs text-slate-400">Receives</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default DashboardView;
