import {ipcRenderer} from 'electron';
import type {DB} from '../../../shared/types/db';

type RunOptions = {
  batchSize?: number;
  timeoutMs?: number;
};

export const AutomationBridge = {
  getScripts: () => ipcRenderer.invoke('automation-script-get-all'),
  createScript: (script: DB.AutomationScript) =>
    ipcRenderer.invoke('automation-script-create', script),
  updateScript: (id: number, updates: Partial<DB.AutomationScript>) =>
    ipcRenderer.invoke('automation-script-update', id, updates),
  deleteScript: (id: number) => ipcRenderer.invoke('automation-script-delete', id),
  getRuns: () => ipcRenderer.invoke('automation-run-get-all'),
  getRunsByScript: (scriptId: number) =>
    ipcRenderer.invoke('automation-run-get-by-script', scriptId),
  startRuns: (scriptId: number, windowIds: number[], options: RunOptions = {}) =>
    ipcRenderer.invoke('automation-run-start', scriptId, windowIds, options),
  cancelRuns: (runIds: number[]) => ipcRenderer.invoke('automation-run-cancel', runIds),
};
