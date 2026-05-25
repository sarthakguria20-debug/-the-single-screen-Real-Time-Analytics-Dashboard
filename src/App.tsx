/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState, useRef } from "react";
import { Activity, Users, ActivitySquare, AlertTriangle, Zap, Server } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function App() {
  const [data, setData] = useState<{ time: string, events: number }[]>([]);
  const [stats, setStats] = useState({
    activeUsers60s: 0,
    currentEventsPerSecond: 0,
    maxTrafficEver: 0
  });
  const [connected, setConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 5));
  }

  useEffect(() => {
    // Connect to Server-Sent Events stream
    const evtSource = new EventSource('/api/stream');

    evtSource.onopen = () => {
      setConnected(true);
      addLog("System: SSE connection established.");
    };

    evtSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.heartbeat) return;

      setData(parsed.series);
      setStats({
        activeUsers60s: parsed.activeUsers60s || 0,
        currentEventsPerSecond: parsed.currentEventsPerSecond || 0,
        maxTrafficEver: parsed.maxTrafficEver || 0
      });
    };

    evtSource.onerror = () => {
      setConnected(false);
      evtSource.close();
      addLog("System: SSE connection lost. Retrying...");
      // For a real app, implement a retry backoff here.
    };

    return () => {
      evtSource.close();
    };
  }, []);

  const triggerEvent = async (count: number = 1) => {
    setIsSimulating(true);
    try {
        await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count })
        });
        addLog(`Processed batch payload: ${count.toLocaleString()} hits`);
    } catch (err) {
        addLog(`Error processing payload: ${err}`);
    }
    setIsSimulating(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
                <ActivitySquare className="w-5 h-5" />
              </div>
              StreamSight Analytics
            </h1>
            <p className="text-slate-500 text-xs mt-2 uppercase tracking-tight font-medium">Real-time edge event ingestion & windowing</p>
          </div>
          <div className="flex items-center gap-6 bg-white px-5 py-2.5 rounded-md border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">{connected ? 'Edge Ingestion Active' : 'Reconnecting...'}</span>
            </div>
            <div className="h-6 w-px bg-slate-200"></div>
            <button className="text-xs font-bold tracking-tight text-slate-600 hover:text-slate-900 transition-colors uppercase">Manage Alerts</button>
          </div>
        </header>

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard 
            title="Active Connections (60s)" 
            value={stats.activeUsers60s.toLocaleString()} 
            icon={<Users className="w-6 h-6 text-blue-100" />}
            highlight={true}
          />
          <MetricCard 
            title="Current Throughput (EPS)" 
            value={stats.currentEventsPerSecond.toLocaleString()} 
            icon={<Activity className="w-6 h-6 text-slate-400" />}
          />
          <MetricCard 
            title="Highest Burst (All-time)" 
            value={stats.maxTrafficEver.toLocaleString()} 
            icon={<Zap className="w-6 h-6 text-slate-400" />}
          />
        </div>

        {/* Main Chart */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 relative overflow-hidden bg-[linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px]">
          <div className="absolute top-6 right-6 flex gap-2 z-10">
            <span className="px-2 py-0.5 rounded font-bold uppercase bg-blue-100 text-blue-700 text-[10px]">O(1) PROCESSING</span>
            <span className="px-2 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-700 text-[10px]">IN-MEMORY</span>
          </div>
          <h2 className="text-sm uppercase tracking-wide text-slate-700 font-bold mb-6 flex items-center gap-2 z-10 relative bg-white/80 inline-flex px-2 py-1 rounded backdrop-blur-sm -ml-2 -mt-1">
            <Server className="w-4 h-4 text-slate-500" /> 
            Network Ingress Volume
          </h2>
          <div className="h-[400px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickMargin={10} minTickGap={30} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '6px', color: '#0f172a', fontWeight: 'bold', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#0f172a' }}
                  formatter={(value: number) => [value.toLocaleString(), 'Events']}
                  labelStyle={{ color: '#64748b', fontWeight: 'normal', marginBottom: '4px' }}
                />
                <Area 
                  isAnimationActive={false}
                  type="monotone" 
                  dataKey="events" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorEvents)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-lg lg:col-span-2">
            <h3 className="font-bold text-slate-700 mb-2">Simulate Network Traffic</h3>
            <p className="text-slate-500 text-xs font-medium mb-8">Dispatch payloads to the ingestion API to observe memory-safe processing.</p>
            
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => triggerEvent(1)}
                disabled={isSimulating}
                className="px-5 py-2.5 border-2 border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-600 transition-colors rounded-lg text-xs font-bold uppercase tracking-tight focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
              >
                Single Event (1x)
              </button>
              <button 
                onClick={() => triggerEvent(250)}
                disabled={isSimulating}
                className="px-5 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-transparent transition-colors rounded-lg text-xs font-bold uppercase tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Traffic Spike (250x)
              </button>
              <button 
                onClick={() => triggerEvent(10000)}
                disabled={isSimulating}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-colors rounded-lg text-xs font-bold uppercase tracking-tight flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-slate-700 disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                Burst Hit (10,000x)
              </button>
            </div>
          </div>
          
          <div className="bg-slate-50/50 border border-slate-200 shadow-sm p-6 rounded-lg flex flex-col font-mono text-xs overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>
             </div>
            <h3 className="text-slate-500 text-[10px] font-bold uppercase mb-4 tracking-wider">SYSTEM.LOG</h3>
            <div className="space-y-2.5 flex-1">
              {log.map((entry, idx) => (
                <div key={idx} className="flex gap-3">
                  <span className="text-slate-400">[{new Date().toLocaleTimeString([], {hour12:false, second:'2-digit', minute:'2-digit'})}]</span>
                  <span className={entry.includes('Error') ? 'text-red-600 font-medium' : 'text-slate-700'}>{entry}</span>
                </div>
              ))}
              {log.length === 0 && <div className="text-slate-400 italic">Awaiting events...</div>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, highlight = false }: { title: string, value: string, icon: React.ReactNode, highlight?: boolean }) {
  if (highlight) {
    return (
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 border border-transparent p-6 rounded-lg shadow-sm flex flex-col justify-between text-white relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute -right-4 -top-8 w-24 h-24 bg-white opacity-5 rounded-full blur-2xl"></div>
        <div className="flex items-start justify-between relative z-10">
          <div className="flex-1">
            <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2">
              {title}
            </p>
            <div className="text-5xl font-black tabular-nums mt-1">
              {value}
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[10px] text-blue-200 font-bold uppercase tracking-wide">
              <Activity className="w-3 h-3" />
              <span>Real-time Sync</span>
            </div>
          </div>
          <div className="p-2">
             {icon}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            {title}
          </p>
          <div className="text-4xl font-bold text-slate-800 tabular-nums mt-2">
            {value}
          </div>
        </div>
        <div className="p-2 text-slate-400">
          {icon}
        </div>
      </div>
    </div>
  );
}

