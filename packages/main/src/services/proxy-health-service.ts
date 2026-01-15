import axios from 'axios';
import {createLogger, getRequestProxy} from '../../../shared/utils';
import type {DB} from '../../../shared/types/db';
import {ProxyDB} from '../db/proxy';
import {ProxyHealthDB} from '../db/proxy-health';
import {getAgent} from '../fingerprint/prepare';

const logger = createLogger('proxy-health');

type ProxyHealthResult = {
  status: DB.ProxyHealth['status'];
  latencyMs: number | null;
  httpStatus: number | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
};

const defaultIntervalMs = 5 * 60 * 1000;
const defaultTimeoutMs = 7_000;
const defaultHealthUrl = 'https://ipinfo.io/json';
const degradedThresholdMs = 3_000;

const resolveProxyHealthStatus = (httpStatus: number | null, latencyMs: number | null): DB.ProxyHealth['status'] => {
  if (!httpStatus || httpStatus >= 400) {
    return 'unhealthy';
  }
  if (latencyMs !== null && latencyMs > degradedThresholdMs) {
    return 'degraded';
  }
  return 'healthy';
};

const checkProxyHealth = async (proxy: DB.Proxy): Promise<ProxyHealthResult> => {
  if (!proxy.proxy || !proxy.proxy_type) {
    return {
      status: 'unhealthy',
      latencyMs: null,
      httpStatus: null,
      geoCountry: null,
      geoRegion: null,
      geoCity: null,
    };
  }

  const url = process.env.PROXY_HEALTH_URL || defaultHealthUrl;
  const timeout = Number(process.env.PROXY_HEALTH_TIMEOUT_MS) || defaultTimeoutMs;
  const {agent, agentField} = getAgent(proxy);
  const requestProxy =
    proxy.proxy_type?.toLowerCase() === 'socks5' ? undefined : getRequestProxy(proxy.proxy, proxy.proxy_type);
  const startedAt = Date.now();

  try {
    const response = await axios.get(url, {
      timeout,
      proxy: agent ? false : requestProxy,
      [agentField]: agent,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - startedAt;
    const geo = response.data ?? {};
    const status = resolveProxyHealthStatus(response.status, latencyMs);
    return {
      status,
      latencyMs,
      httpStatus: response.status,
      geoCountry: geo.country ?? null,
      geoRegion: geo.region ?? null,
      geoCity: geo.city ?? null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logger.warn(`Proxy health check failed for proxy ${proxy.id}: ${(error as Error).message}`);
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatus: null,
      geoCountry: null,
      geoRegion: null,
      geoCity: null,
    };
  }
};

const persistHealthResult = async (proxyId: number, result: ProxyHealthResult) => {
  const payload: DB.ProxyHealth = {
    proxy_id: proxyId,
    status: result.status,
    latency_ms: result.latencyMs,
    http_status: result.httpStatus,
    geo_country: result.geoCountry,
    geo_region: result.geoRegion,
    geo_city: result.geoCity,
    checked_at: new Date().toISOString(),
  };

  await ProxyHealthDB.upsertHealth(payload);
  await ProxyHealthDB.addHistory({
    proxy_id: proxyId,
    status: payload.status,
    latency_ms: payload.latency_ms,
    http_status: payload.http_status,
    geo_country: payload.geo_country,
    geo_region: payload.geo_region,
    geo_city: payload.geo_city,
    checked_at: payload.checked_at,
  });
};

const runProxyHealthChecks = async () => {
  const proxies = await ProxyDB.all();
  for (const proxy of proxies) {
    if (!proxy.id) {
      continue;
    }
    const proxyId = Number(proxy.id);
    if (!Number.isInteger(proxyId)) {
      continue;
    }
    const result = await checkProxyHealth(proxy as DB.Proxy);
    await persistHealthResult(proxyId, result);
  }
};

export const initProxyHealthService = () => {
  const intervalMs = Number(process.env.PROXY_HEALTH_INTERVAL_MS) || defaultIntervalMs;
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runProxyHealthChecks();
    } catch (error) {
      logger.error(`Proxy health check failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, intervalMs);
};
