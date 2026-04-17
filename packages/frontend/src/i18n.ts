import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      dashboard: {
        title: "LEX-ATC // TRAFFIC",
        quick_policies: "Quick Policies",
        executive_summary: "EXECUTIVE SUMMARY",
        total_agents: "Total Agents",
        system_latency: "System Latency",
        active_shards: "Active Shards"
      },
      tour: {
        welcome: "Welcome to LEX-ATC! This is your central command for managing autonomous AI agents. Let's take a quick tour.",
        radar: "The 3D Radar shows real-time agent competition. Agents gather in the center to acquire the FencedLock and execute tasks.",
        sidebar: "This sidebar lists all active agents. You can pause them, grant priority, or take over their locks.",
        terminal: "The Terminal Log provides real-time audit trails of all economic events, lock acquisitions, and AI reasoning.",
        emergency: "In case of rogue agents, hit Emergency Takeover to forcibly evict all agents and reclaim the central lock."
      },
      sidebar: {
        operations: "Operations",
        agents: "Agents",
        halt_all: "HALT ALL",
        emergency_takeover: "Emergency Takeover",
        release_control: "Release Control"
      }
    }
  },
  ko: {
    translation: {
      dashboard: {
        title: "LEX-ATC // TRAFFIC",
        quick_policies: "빠른 정책 실행",
        executive_summary: "경영진 요약 (EXECUTIVE SUMMARY)",
        total_agents: "활성 에이전트",
        system_latency: "시스템 지연시간",
        active_shards: "활성 샤드"
      },
      tour: {
        welcome: "LEX-ATC에 오신 것을 환영합니다! 자율 AI 에이전트를 관리하는 중앙 관제 시스템입니다. 튜토리얼을 시작합니다.",
        radar: "3D 레이더는 에이전트 간의 실시간 경쟁을 보여줍니다. 에이전트들은 중앙으로 모여 분산 락(FencedLock)을 얻고 작업을 수행합니다.",
        sidebar: "사이드바에서는 모든 활성 에이전트 목록을 볼 수 있습니다. 에이전트를 일시 정지하거나, 우선순위를 부여하고, 강제로 제어권을 뺏을 수 있습니다.",
        terminal: "터미널 로그는 모든 경제 이벤트, 락 획득, AI 추론 내역에 대한 실시간 감사 추적(Audit Trail)을 제공합니다.",
        emergency: "비정상적인 에이전트가 발생할 경우, 비상 제어(Emergency Takeover)를 눌러 모든 에이전트를 강제로 쫓아내고 락을 회수할 수 있습니다."
      },
      sidebar: {
        operations: "시스템 운영",
        agents: "에이전트 목록",
        halt_all: "전체 정지",
        emergency_takeover: "비상 제어 권한 획득",
        release_control: "비상 제어 해제"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

export default i18n;