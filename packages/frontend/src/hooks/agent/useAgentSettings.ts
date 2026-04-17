import { useShallow } from 'zustand/react/shallow';
// src/hooks/agent/useAgentSettings.ts
import { useState, useEffect } from 'react';
import { useATCStore } from '@/store/atc';
import { useUIStore } from '@/store/ui';
import { frontendConfig } from '@/config/runtime';

export const useAgentSettings = (onClose: () => void) => {
    const { agents = [], updateAgentConfig  } = useATCStore(useShallow(s => ({ agents: s.agents, updateAgentConfig: s.actions.updateAgentConfig })));
    const { isDark, areTooltipsEnabled, setAreTooltipsEnabled  } = useUIStore(useShallow(s => ({ isDark: s.isDark, areTooltipsEnabled: s.areTooltipsEnabled, setAreTooltipsEnabled: s.setAreTooltipsEnabled })));
    
    const [selectedAgent, setSelectedAgent] = useState<string>(agents[0]?.id || '');
    const [provider, setProvider] = useState('mock');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI traffic controller.');
    const [isLoading, setIsLoading] = useState(false);
    
    const API_URL = frontendConfig.api.baseUrl.replace('/api', '');

    useEffect(() => {
        if (!selectedAgent || selectedAgent === "Select") return;
        
        const abortController = new AbortController();
        const loadConfig = async () => {
            const authHeaders: Record<string, string> = {};

            try {
                const response = await fetch(`${API_URL}/api/agents/${encodeURIComponent(selectedAgent)}/config`, {
                    signal: abortController.signal,
                    credentials: 'include',
                    headers: { ...authHeaders }
                });
                
                if (response.status === 404) {
                    setProvider('mock');
                    setModel('');
                    setSystemPrompt('You are a helpful AI traffic controller.');
                    return; 
                }

                if (response.ok) {
                    const data = await response.json();
                    setProvider(data.provider || 'mock');
                    setModel(data.model || '');
                    setSystemPrompt(data.systemPrompt || 'You are a helpful AI traffic controller.');
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("[ATC_SYSTEM] Network connection failed.");
                }
            }
        };
        loadConfig();
        return () => abortController.abort();
    }, [selectedAgent, API_URL]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAgent || selectedAgent === "Select") { onClose(); return; }

        setIsLoading(true);
        const authHeaders: Record<string, string> = {};

        try {
            const response = await fetch(`${API_URL}/api/agents/${encodeURIComponent(selectedAgent)}/config`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ config: { provider, apiKey, model: model.trim(), systemPrompt } }),
            });

            if (response.ok) {
                updateAgentConfig(selectedAgent, { model: model.trim() });
            }
        } catch (err) {
            console.error("SYNC_ERROR:", err);
        } finally {
            setIsLoading(false);
            onClose();
        }
    };

    return {
        agents, isDark, areTooltipsEnabled, setAreTooltipsEnabled,
        selectedAgent, setSelectedAgent, provider, setProvider,
        apiKey, setApiKey, model, setModel, systemPrompt, setSystemPrompt,
        isLoading, handleSubmit
    };
};
