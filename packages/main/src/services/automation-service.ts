import type {Browser} from 'puppeteer';
import {createLogger} from '../../../shared/utils/logger';
import {SERVICE_LOGGER_LABEL} from '../constants';
import {AutomationDB} from '../db/automation';
import type {DB} from '../../../shared/types/db';
import {openFingerprintWindow} from '../fingerprint';
import puppeteer from 'puppeteer';
import {pathToFileURL} from 'url';
import {createRequire} from 'module';
import {app, ipcMain} from 'electron';
import {bridgeMessageToUI} from '../mainWindow';
import {promises as fs} from 'fs';
import path from 'path';
import vm from 'vm';

const logger = createLogger(SERVICE_LOGGER_LABEL);
const require = createRequire(import.meta.url);

type AutomationRunOptions = {
  batchSize?: number;
  timeoutMs?: number;
};

type RunContext = {
  runId: number;
  script: DB.AutomationScript;
  windowId: number;
  timeoutMs: number;
};

type RunnerContext = {
  browser?: Browser;
  page?: unknown;
  driver?: unknown;
  windowId: number;
  log: (message: string) => Promise<void>;
  signal: AbortSignal;
};

type ScriptRunner = (context: RunnerContext) => Promise<void>;

type ActiveRun = {
  controller: AbortController;
  runId: number;
};

type SandboxConfig = {
  allowedDomains: string[];
  allowedScriptRoots: string[];
  maxScriptBytes: number;
  blockedTokens: RegExp[];
};

const activeRuns = new Map<number, ActiveRun>();

const defaultTimeoutMs = 5 * 60 * 1000;
const defaultScriptMaxBytes = 200_000;

const getSandboxConfig = (): SandboxConfig => {
  const allowedDomains = process.env.AUTOMATION_ALLOWED_DOMAINS?.split(',')
    .map(domain => domain.trim())
    .filter(Boolean) ?? ['localhost', '127.0.0.1'];
  const allowedRoots = process.env.AUTOMATION_ALLOWED_SCRIPT_ROOTS?.split(',')
    .map(root => root.trim())
    .filter(Boolean);
  const defaultRoot = path.resolve(app.getPath('userData'), 'automation-scripts');
  return {
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : ['localhost', '127.0.0.1'],
    allowedScriptRoots: allowedRoots && allowedRoots.length > 0 ? allowedRoots : [defaultRoot],
    maxScriptBytes: Number(process.env.AUTOMATION_MAX_SCRIPT_BYTES) || defaultScriptMaxBytes,
    blockedTokens: [
      /\brequire\s*\(/i,
      /\bimport\s+.*from\b/i,
      /\bchild_process\b/i,
      /\bfs\b/i,
      /\bprocess\b/i,
      /\bnet\b/i,
      /\btls\b/i,
      /\bhttp\b/i,
      /\bhttps\b/i,
    ],
  };
};

const isAllowedUrl = (rawUrl: string, allowlist: string[]) => {
  if (rawUrl.startsWith('about:') || rawUrl.startsWith('chrome:') || rawUrl.startsWith('data:')) {
    return true;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true;
    }
    const hostname = url.hostname.toLowerCase();
    return allowlist.some(allowed => {
      const normalized = allowed.toLowerCase();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
};

const assertScriptPathAllowed = (scriptPath: string, allowedRoots: string[]) => {
  const resolved = path.resolve(scriptPath);
  const allowed = allowedRoots.some(root => {
    const normalized = path.resolve(root);
    return resolved === normalized || resolved.startsWith(`${normalized}${path.sep}`);
  });
  if (!allowed) {
    throw new Error('Script path is outside the allowed sandbox roots.');
  }
  return resolved;
};

const validateScriptContent = (content: string, config: SandboxConfig) => {
  if (Buffer.byteLength(content, 'utf8') > config.maxScriptBytes) {
    throw new Error('Script content exceeds size limit.');
  }
  for (const token of config.blockedTokens) {
    if (token.test(content)) {
      throw new Error('Script content contains restricted keywords.');
    }
  }
};

const buildLogMessage = (message: string) => {
  return `[${new Date().toISOString()}] ${message}`;
};

const appendRunLog = async (runId: number, message: string) => {
  const formatted = buildLogMessage(message);
  await AutomationDB.appendRunLog(runId, formatted);
  logger.info(`automation run ${runId}: ${message}`);
};

const loadRunnerFromScript = async (
  script: DB.AutomationScript,
  config: SandboxConfig,
): Promise<ScriptRunner> => {
  if (script.content) {
    validateScriptContent(script.content, config);
    const sandbox = vm.createContext({
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    });
    const runnerFactory = new vm.Script(
      `(async (context) => {"use strict";\n${script.content}\n})`,
    );
    const runner = runnerFactory.runInContext(sandbox, {timeout: 1000}) as (
      context: RunnerContext,
    ) => Promise<void> | void;
    return async context => {
      await Promise.resolve(runner(context));
    };
  }

  if (script.path) {
    const resolvedPath = assertScriptPathAllowed(script.path, config.allowedScriptRoots);
    const fileContent = await fs.readFile(resolvedPath, 'utf8');
    validateScriptContent(fileContent, config);
    const moduleUrl = pathToFileURL(resolvedPath).href;
    const module = await import(moduleUrl);
    const runner = module.default ?? module.run;
    if (typeof runner !== 'function') {
      throw new Error('Script module must export a default async function or named export run.');
    }
    return runner as ScriptRunner;
  }

  throw new Error('Script content or path is required.');
};

const runWithTimeout = async (fn: () => Promise<void>, timeoutMs: number, controller: AbortController) => {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<void>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error('Run timed out.'));
    }, timeoutMs);
  });

  try {
    await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const getBrowserConnectionInfo = async (windowId: number) => {
  const result = await openFingerprintWindow(windowId, true);
  if (!result?.webSocketDebuggerUrl) {
    throw new Error('Unable to open window or fetch debugger URL.');
  }
  return result.webSocketDebuggerUrl as string;
};

const runWithPuppeteer = async (
  windowId: number,
  runner: ScriptRunner,
  log: (message: string) => Promise<void>,
  controller: AbortController,
  config: SandboxConfig,
) => {
  const webSocketDebuggerUrl = await getBrowserConnectionInfo(windowId);
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    defaultViewport: null,
  });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (!isAllowedUrl(url, config.allowedDomains)) {
        void log(`Blocked request to ${url}`);
        request.abort().catch(() => undefined);
        return;
      }
      request.continue().catch(() => undefined);
    });
    await runner({browser, page, windowId, log, signal: controller.signal});
  } finally {
    await browser.disconnect();
  }
};

const runWithPlaywright = async (
  windowId: number,
  runner: ScriptRunner,
  log: (message: string) => Promise<void>,
  controller: AbortController,
  config: SandboxConfig,
) => {
  const webSocketDebuggerUrl = await getBrowserConnectionInfo(windowId);
  const playwright = await import('playwright');
  const browser = await playwright.chromium.connectOverCDP(webSocketDebuggerUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.route('**/*', route => {
      const url = route.request().url();
      if (!isAllowedUrl(url, config.allowedDomains)) {
        void log(`Blocked request to ${url}`);
        route.abort().catch(() => undefined);
        return;
      }
      route.continue().catch(() => undefined);
    });
    await runner({page, windowId, log, signal: controller.signal});
  } finally {
    await browser.close();
  }
};

const runWithSelenium = async (
  windowId: number,
  runner: ScriptRunner,
  log: (message: string) => Promise<void>,
  controller: AbortController,
  config: SandboxConfig,
) => {
  const webSocketDebuggerUrl = await getBrowserConnectionInfo(windowId);
  const url = new URL(webSocketDebuggerUrl);
  const port = url.port;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webdriver = require('selenium-webdriver');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chrome = require('selenium-webdriver/chrome');
    const options = new chrome.Options();
    options.debuggerAddress(`127.0.0.1:${port}`);
    const driver = await new webdriver.Builder().forBrowser('chrome').setChromeOptions(options).build();
    const wrappedDriver = new Proxy(driver, {
      get(target, prop, receiver) {
        if (prop === 'get') {
          return async (targetUrl: string) => {
            if (!isAllowedUrl(targetUrl, config.allowedDomains)) {
              await log(`Blocked navigation to ${targetUrl}`);
              throw new Error('Navigation blocked by domain allowlist.');
            }
            return (target as typeof driver).get(targetUrl);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    try {
      await runner({driver: wrappedDriver, windowId, log, signal: controller.signal});
    } finally {
      await driver.quit();
    }
  } catch (error) {
    throw new Error(
      `Selenium runner not available: ${(error as Error).message ?? 'missing dependency'}`,
    );
  }
};

const executeRun = async (run: RunContext) => {
  const controller = new AbortController();
  const {runId, script, windowId, timeoutMs} = run;
  const sandboxConfig = getSandboxConfig();
  activeRuns.set(runId, {controller, runId});

  const log = async (message: string) => {
    await appendRunLog(runId, message);
  };

  try {
    await AutomationDB.updateRun(runId, {status: 'running', started_at: new Date().toISOString()});
    await log('Run started.');
    const runner = await loadRunnerFromScript(script, sandboxConfig);
    await runWithTimeout(async () => {
      if (controller.signal.aborted) {
        throw new Error('Run cancelled.');
      }
      await log(`Using runner type: ${script.type}.`);
      if (script.type === 'puppeteer') {
        await runWithPuppeteer(windowId, runner, log, controller, sandboxConfig);
      } else if (script.type === 'playwright') {
        await runWithPlaywright(windowId, runner, log, controller, sandboxConfig);
      } else if (script.type === 'selenium') {
        await runWithSelenium(windowId, runner, log, controller, sandboxConfig);
      } else {
        throw new Error(`Unsupported automation type: ${script.type}`);
      }
    }, timeoutMs, controller);

    await log('Run completed successfully.');
    await AutomationDB.updateRun(runId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
    });
    bridgeMessageToUI({
      type: 'success',
      text: `Automation run ${runId} completed.`,
    });
  } catch (error) {
    const message = (error as Error).message ?? 'Unknown error';
    const status = controller.signal.aborted ? 'cancelled' : message.includes('timed out') ? 'timeout' : 'failed';
    await log(`Run failed: ${message}`);
    await AutomationDB.updateRun(runId, {
      status,
      finished_at: new Date().toISOString(),
    });
    bridgeMessageToUI({
      type: status === 'cancelled' ? 'warning' : 'error',
      text: `Automation run ${runId} ${status}.`,
    });
  } finally {
    activeRuns.delete(runId);
  }
};

const runWithConcurrency = async (runs: RunContext[], batchSize: number) => {
  const queue = [...runs];
  const workers = Array.from({length: Math.min(batchSize, queue.length)}, () =>
    (async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) {
          await executeRun(next);
        }
      }
    })(),
  );
  await Promise.all(workers);
};

export const enqueueAutomationRuns = async (
  script: DB.AutomationScript,
  runIds: number[],
  windowIds: number[],
  options: AutomationRunOptions = {},
) => {
  const batchSize = options.batchSize ?? 3;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const runs: RunContext[] = runIds.map((runId, index) => ({
    runId,
    script,
    windowId: windowIds[index],
    timeoutMs,
  }));

  for (const run of runs) {
    await AutomationDB.updateRun(run.runId, {status: 'queued'});
    await appendRunLog(run.runId, 'Run queued.');
  }

  void runWithConcurrency(runs, batchSize);
};

export const cancelAutomationRuns = async (runIds: number[]) => {
  for (const runId of runIds) {
    const active = activeRuns.get(runId);
    if (active) {
      active.controller.abort();
      await appendRunLog(runId, 'Run cancelled by user.');
    } else {
      await AutomationDB.updateRun(runId, {status: 'cancelled', finished_at: new Date().toISOString()});
      await appendRunLog(runId, 'Run cancelled before start.');
    }
  }
};

export const initAutomationService = () => {
  logger.info('init automation service...');
  ipcMain.handle('automation-script-get-all', async () => {
    return await AutomationDB.allScripts();
  });

  ipcMain.handle('automation-script-create', async (_, script: DB.AutomationScript) => {
    const {id} = await AutomationDB.createScript(script);
    return await AutomationDB.getScriptById(id);
  });

  ipcMain.handle(
    'automation-script-update',
    async (_, id: number, updates: Partial<DB.AutomationScript>) => {
      await AutomationDB.updateScript(id, updates);
      return await AutomationDB.getScriptById(id);
    },
  );

  ipcMain.handle('automation-script-delete', async (_, id: number) => {
    return await AutomationDB.deleteScript(id);
  });

  ipcMain.handle('automation-run-get-all', async () => {
    return await AutomationDB.allRuns();
  });

  ipcMain.handle('automation-run-get-by-script', async (_, scriptId: number) => {
    return await AutomationDB.getRunsByScriptId(scriptId);
  });

  ipcMain.handle(
    'automation-run-start',
    async (
      _,
      scriptId: number,
      windowIds: number[],
      options: AutomationRunOptions = {},
    ) => {
      const script = await AutomationDB.getScriptById(scriptId);
      if (!script) {
        throw new Error('Script not found.');
      }
      const runRows: DB.AutomationRunCreateInput[] = windowIds.map(windowId => ({
        script_id: scriptId,
        window_id: windowId,
        status: 'pending',
      }));
      const runIds = await AutomationDB.createRuns(runRows);
      await enqueueAutomationRuns(script, runIds as number[], windowIds, options);
      return runIds;
    },
  );

  ipcMain.handle('automation-run-cancel', async (_, runIds: number[]) => {
    await cancelAutomationRuns(runIds);
    return true;
  });
};
