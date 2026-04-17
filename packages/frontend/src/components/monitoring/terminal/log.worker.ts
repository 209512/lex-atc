import { isEconomyLog, matchesPrimaryFilter, knownActionGroups } from './logFilters';

self.onmessage = (e: MessageEvent) => {
  const { logs, filter, showOnlyEconomy, domainFilter, actionKeyFilter } = e.data;

  const filteredLogs = (logs || []).filter((log: any) => {
    if (showOnlyEconomy && !isEconomyLog(log.message, log.type)) return false;
    if (!matchesPrimaryFilter(filter, log)) return false;
    if (domainFilter !== 'ALL' && log.domain !== domainFilter) return false;
    if (actionKeyFilter !== 'ALL' && log.actionKey !== actionKeyFilter) return false;
    return true;
  });

  const grouped = new Map<string, Set<string>>();
  (logs || []).forEach((log: any) => {
    if (log.domain && log.actionKey) {
      if (!grouped.has(log.domain)) grouped.set(log.domain, new Set());
      grouped.get(log.domain)?.add(log.actionKey);
    }
  });

  const actionFilterGroups = (Object.keys(knownActionGroups)).map((domain) => ({
    domain,
    actions: Array.from(new Set([...(knownActionGroups[domain] || []), ...(grouped.get(domain) ? Array.from(grouped.get(domain) || []) : [])])).sort(),
  })).filter((group) => group.actions.length > 0);

  self.postMessage({ filteredLogs, actionFilterGroups });
};
