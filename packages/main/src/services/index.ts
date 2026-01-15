import {initCommonService} from './common-service';
import {initGroupService} from './group-service';
import {initProxyService} from './proxy-service';
import {initProxyHealthService} from './proxy-health-service';
import {initSyncService} from './sync-service';
import {initTagService} from './tag-service';
import {initWindowService} from './window-service';
import {initExtensionService} from './extension-service';
import {initMultiWindowSyncService} from './multi-window-sync-service';
import {initAutomationService} from './automation-service';
import {initBackupService} from './backup-service';

export async function initServices() {
  initCommonService();
  initWindowService();
  initGroupService();
  initProxyService();
  initProxyHealthService();
  initTagService();
  initSyncService();
  initExtensionService();
  initMultiWindowSyncService();
  initAutomationService();
  initBackupService();
}
