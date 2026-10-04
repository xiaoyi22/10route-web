import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePreferences = create(persist(set => ({
  theme: 'system',
  setTheme: theme => set({ theme }),
  usagePeriod: '24h',
  setUsagePeriod: usagePeriod => set({ usagePeriod }),
  showLogPrices: false,
  setShowLogPrices: showLogPrices => set({ showLogPrices }),
  autoRefreshLogs: true,
  setAutoRefreshLogs: autoRefreshLogs => set({ autoRefreshLogs }),
  healthyConnectionsOnly: false,
  setHealthyConnectionsOnly: healthyConnectionsOnly => set({ healthyConnectionsOnly }),
}), { name: '10router-web-preferences' }));
