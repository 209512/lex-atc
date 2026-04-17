// src/utils/logStyles.ts
export type LogType = 'critical' | 'error' | 'warn' | 'success' | 'system' | 'info' | 'lock' | 'policy';

export const LOG_LEVELS: Record<LogType, { color: string; tag: string; label: string }> = {
    critical: { color: '#ef4444', tag: '[CRIT]', label: 'CRITICAL' },
    error:    { color: '#f97316', tag: '[ERR ]', label: 'ERROR' },
    warn:     { color: '#f59e0b', tag: '[WARN]', label: 'WARNING' },
    success:  { color: '#10b981', tag: '[ACQ ]', label: 'SUCCESS' },
    system:   { color: '#a855f7', tag: '[SYS ]', label: 'SYSTEM' },
    info:     { color: '#3b82f6', tag: '[INFO]', label: 'INFO' },
    lock:     { color: '#10b981', tag: '[LOCK]', label: 'LOCK_GRANTED' },
    policy:   { color: '#84cc16', tag: '[PLC ]', label: 'POLICY' }
};

export const getLogStyle = (type: LogType, isDark: boolean) => {
    const base = LOG_LEVELS[type] || LOG_LEVELS.info;
    const tailwindColors: Record<LogType, string> = {
        critical: 'text-red-500 font-bold animate-pulse',
        error:    'text-orange-500 font-bold',
        warn:     'text-amber-500 font-medium',
        success:  'text-emerald-500 font-bold',
        system:   'text-purple-500 font-bold',
        lock:     isDark ? 'text-emerald-400 font-bold brightness-125' : 'text-emerald-700 font-black',
        policy:   isDark ? 'text-lime-400 font-bold' : 'text-lime-700 font-bold',
        info:     isDark ? 'text-blue-400' : 'text-blue-600'
    };
    return { ...base, className: tailwindColors[type] || tailwindColors.info };
};