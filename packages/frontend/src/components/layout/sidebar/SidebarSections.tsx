import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import { SystemStats } from '@/components/sidebar/SystemStats';
import { AgentList } from '@/components/sidebar/AgentList';
import { L4StatusPanel } from '@/components/sidebar/L4StatusPanel';
import { OperationsPanel } from '@/components/sidebar/OperationsPanel';
import { SidebarSection } from '@/components/sidebar/SidebarSection';
import type { SidebarSectionKey } from '@/contexts/uiPreferences';

const SECTION_TITLES: Record<SidebarSectionKey, string> = {
  overview: 'System Overview',
  l4: 'L4 Monitoring',
  ops: 'Operations',
  agents: 'Agents'
};

const SECTION_SUBTITLES: Record<SidebarSectionKey, string> = {
  overview: 'capacity · radar · local overview',
  l4: 'hot items · axes',
  ops: 'governance · isolation · settlement',
  agents: 'identity · queue · tactical controls'
};

interface SidebarSectionsProps {
  isDark: boolean;
  globalStop: boolean;
  sectionOrder: SidebarSectionKey[];
  sections: Record<SidebarSectionKey, boolean>;
  onToggleSection: (key: SidebarSectionKey) => void;
  onMoveSection: (idx: number, dir: 1 | -1) => void;
  onOpenPolicyTemplates: () => void;
  onToggleGlobalStop: () => void;
}

export const SidebarSections = ({
  isDark,
  globalStop,
  sectionOrder,
  sections,
  onToggleSection,
  onMoveSection,
  onOpenPolicyTemplates,
  onToggleGlobalStop
}: SidebarSectionsProps) => {
  const renderSection = (key: SidebarSectionKey, idx: number) => {
    const props = {
      title: SECTION_TITLES[key],
      subtitle: SECTION_SUBTITLES[key],
      isDark,
      isOpen: sections[key],
      onToggle: () => onToggleSection(key),
      onMoveUp: () => onMoveSection(idx, -1),
      onMoveDown: () => onMoveSection(idx, 1),
      disableMoveUp: idx === 0,
      disableMoveDown: idx === sectionOrder.length - 1
    };

    switch (key) {
      case 'overview':
        return <SidebarSection key={key} {...props}><SystemStats /></SidebarSection>;
      case 'l4':
        return (
          <SidebarSection
            key={key}
            {...props}
            titleAddon={(
              <Link
                to="/status-system"
                onClick={(e) => { e.stopPropagation(); }}
                aria-label="Status guide 열기"
                data-testid="l4-status-guide"
                data-doc-label="Status System"
                className={clsx(
                  'shrink-0 rounded border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] transition',
                  isDark ? 'border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                )}
              >
                guide
              </Link>
            )}
          >
            <L4StatusPanel />
          </SidebarSection>
        );
      case 'ops':
        return (
          <SidebarSection
            key={key}
            {...props}
            titleAddon={(
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenPolicyTemplates(); }}
                className={clsx(
                  'shrink-0 rounded border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] transition',
                  isDark ? 'border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                )}
              >
                templates
              </button>
            )}
          >
            <OperationsPanel />
          </SidebarSection>
        );
      case 'agents':
        return (
          <SidebarSection
            key={key}
            {...props}
            titleAddon={(
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleGlobalStop(); }}
                className={clsx(
                  'shrink-0 rounded border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] transition inline-flex items-center gap-1',
                  globalStop
                    ? (isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                    : (isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100')
                )}
                aria-label={globalStop ? '전체 재개' : '전체 일시정지'}
              >
                {globalStop ? <Play size={12} /> : <Pause size={12} />}
                {globalStop ? 'resume' : 'pause'}
              </button>
            )}
          >
            <AgentList />
          </SidebarSection>
        );
      default:
        return null;
    }
  };

  return <>{sectionOrder.map((key, idx) => renderSection(key, idx))}</>;
};

