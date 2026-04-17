import React, { useState, useRef } from 'react';
import { X, Save, Key, Cpu, MessageSquare, Settings, ChevronDown, Activity, MonitorPlay, Type } from 'lucide-react';
import clsx from 'clsx';
import { useAgentSettings } from '@/hooks/agent/useAgentSettings';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';

export const AgentSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [isAgentOpen, setIsAgentOpen] = useState(false);
    const [isProviderOpen, setIsProviderOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    const { uiPreferences, updateUIPreferences } = useUIStore(useShallow(s => ({ uiPreferences: s.uiPreferences, updateUIPreferences: s.updateUIPreferences })));

    const {
        agents, isDark, areTooltipsEnabled, setAreTooltipsEnabled,
        selectedAgent, setSelectedAgent, provider, setProvider,
        apiKey, setApiKey, model, setModel, systemPrompt, setSystemPrompt,
        isLoading, handleSubmit
    } = useAgentSettings(onClose);

    const providers = [
        { id: 'mock', name: 'Mock (Simulation)' },
        { id: 'openai', name: 'OpenAI (GPT-4)' },
        { id: 'anthropic', name: 'Anthropic (Claude 3)' },
        { id: 'gemini', name: 'Google Gemini' }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div ref={modalRef} onClick={(e) => e.stopPropagation()}
                className={clsx("w-full max-w-md p-6 rounded-xl shadow-2xl border relative transition-all animate-in zoom-in-95 duration-200",
                    isDark ? "bg-[#0d1117] border-gray-700 text-gray-300" : "bg-white border-slate-200 text-slate-800")}>
                
                <div className={clsx("flex justify-between items-center border-b pb-3 mb-5", isDark ? "border-white/10" : "border-slate-200")}>
                    <h2 className="flex items-center gap-2 font-mono font-bold tracking-widest uppercase text-xs">
                        <Settings size={14} className="text-blue-500" /> SYSTEM_CONFIG
                    </h2>
                    <button onClick={onClose} className="opacity-50 hover:opacity-100 p-1 transition-opacity"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 font-mono">
                    {/* Tooltip Toggle */}
                    <div className={clsx("p-3 rounded-lg border", isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200")}>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 opacity-70 group-hover:opacity-100">
                                <MessageSquare size={12} /> INTERACTIVE_TOOLTIPS
                            </span>
                            <input type="checkbox" checked={areTooltipsEnabled} onChange={(e) => setAreTooltipsEnabled(e.target.checked)} className="sr-only" />
                            <div className={clsx("w-8 h-4 rounded-full transition-colors relative", areTooltipsEnabled ? "bg-blue-600" : "bg-gray-600")}>
                                <div className={clsx("absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform", areTooltipsEnabled ? "translate-x-4" : "translate-x-0")} />
                            </div>
                        </label>
                    </div>

                    <div className={clsx("col-span-2 p-3 rounded-lg border", isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200")}>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 opacity-70 group-hover:opacity-100">
                                <Type size={12} /> FONT_SIZE
                            </span>
                            <select 
                                value={uiPreferences.fontSizeMode}
                                onChange={(e) => updateUIPreferences({ fontSizeMode: e.target.value as any })}
                                className={clsx("bg-transparent border outline-none text-[10px] p-1 rounded", isDark ? "border-gray-700 text-white" : "border-slate-300 text-black")}
                            >
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </label>
                    </div>

                    {/* Accessibility & Visual Settings */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className={clsx("p-3 rounded-lg border", isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200")}>
                            <label className="flex items-center justify-between cursor-pointer group">
                                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 opacity-70 group-hover:opacity-100">
                                    <MonitorPlay size={12} /> REDUCE_MOTION
                                </span>
                                <input type="checkbox" checked={uiPreferences.reduceMotion} onChange={(e) => updateUIPreferences({ reduceMotion: e.target.checked })} className="sr-only" />
                                <div className={clsx("w-8 h-4 rounded-full transition-colors relative", uiPreferences.reduceMotion ? "bg-blue-600" : "bg-gray-600")}>
                                    <div className={clsx("absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform", uiPreferences.reduceMotion ? "translate-x-4" : "translate-x-0")} />
                                </div>
                            </label>
                        </div>
                        <div className={clsx("p-3 rounded-lg border", isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200")}>
                            <label className="flex items-center justify-between cursor-pointer group">
                                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 opacity-70 group-hover:opacity-100">
                                    <Activity size={12} /> LIMIT_FPS (30)
                                </span>
                                <input type="checkbox" checked={uiPreferences.limitFps} onChange={(e) => updateUIPreferences({ limitFps: e.target.checked })} className="sr-only" />
                                <div className={clsx("w-8 h-4 rounded-full transition-colors relative", uiPreferences.limitFps ? "bg-blue-600" : "bg-gray-600")}>
                                    <div className={clsx("absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform", uiPreferences.limitFps ? "translate-x-4" : "translate-x-0")} />
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 relative z-50">
                        {/* Agent Selector */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50">Target Agent</label>
                            <button type="button" onClick={() => { setIsAgentOpen(!isAgentOpen); setIsProviderOpen(false); }} 
                                className={clsx("w-full h-9 px-3 rounded border text-[11px] flex items-center justify-between", isDark ? "bg-black border-gray-700" : "bg-white border-slate-300")}>
                                <span className="truncate">{agents.find(a => a.id === selectedAgent)?.displayId || "Select"}</span>
                                <ChevronDown size={12} className={clsx("transition-transform", isAgentOpen && "rotate-180")} />
                            </button>
                            {isAgentOpen && (
                                <div className={clsx("absolute z-[110] w-[calc(50%-6px)] mt-1 border rounded shadow-2xl max-h-40 overflow-y-auto custom-scrollbar", isDark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200")}>
                                    {agents.map((a) => (
                                        <div key={a.id} onClick={() => { setSelectedAgent(a.id); setIsAgentOpen(false); }}
                                            className="p-2 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors border-b border-white/5 last:border-0 text-[11px]">
                                            {a.displayId || a.id}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Provider Selector */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50">Provider</label>
                            <button type="button" onClick={() => { setIsProviderOpen(!isProviderOpen); setIsAgentOpen(false); }}
                                className={clsx("w-full h-9 px-3 rounded border text-[11px] flex items-center justify-between", isDark ? "bg-black border-gray-700" : "bg-white border-slate-300")}>
                                <span className="truncate">{providers.find(p => p.id === provider)?.name || "Select"}</span>
                                <ChevronDown size={12} className={clsx("transition-transform", isProviderOpen && "rotate-180")} />
                            </button>
                            {isProviderOpen && (
                                <div className={clsx("absolute z-[110] right-0 w-[calc(50%-6px)] mt-1 border rounded shadow-2xl max-h-40 overflow-y-auto custom-scrollbar", isDark ? "bg-gray-900 border-gray-700" : "bg-white border-slate-200")}>
                                    {providers.map((p) => (
                                        <div key={p.id} onClick={() => { setProvider(p.id); setIsProviderOpen(false); }}
                                            className="p-2 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors border-b border-white/5 last:border-0 text-[11px]">
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {provider !== 'mock' && (
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase opacity-50 flex items-center gap-1"><Key size={10} /> API_KEY</label>
                                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                                    className={clsx("w-full h-9 px-3 rounded border text-[11px] outline-none focus:border-blue-500", isDark ? "bg-black border-gray-700 text-blue-400" : "bg-white border-slate-300")} />
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50 flex items-center gap-1"><Cpu size={10} /> MODEL_OVERRIDE</label>
                            <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. gpt-4-turbo"
                                className={clsx("w-full h-9 px-3 rounded border text-[11px] outline-none focus:border-blue-500", isDark ? "bg-black border-gray-700" : "bg-white border-slate-300")} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50 flex items-center gap-1"><MessageSquare size={10} /> SYSTEM_PERSONA</label>
                            <textarea rows={3} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                                className={clsx("w-full p-3 rounded border text-[11px] outline-none focus:border-blue-500 resize-none custom-scrollbar", isDark ? "bg-black border-gray-700" : "bg-white border-slate-300")} />
                        </div>
                    </div>

                    <button type="submit" disabled={isLoading}
                        className={clsx("w-full h-10 mt-2 font-bold rounded flex items-center justify-center gap-2 transition-all uppercase text-[11px] tracking-widest",
                            isLoading ? "bg-gray-700 opacity-50 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg active:scale-95")}>
                        <Save size={14} /> {isLoading ? 'UPDATING...' : 'DEPLOY_CONFIG'}
                    </button>
                </form>
            </div>
        </div>
    );
};