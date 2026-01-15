import {db} from '.';
import type {DB} from '../../../shared/types/db';

const upsertHealth = async (health: DB.ProxyHealth) => {
  const payload = {
    proxy_id: health.proxy_id,
    status: health.status,
    latency_ms: health.latency_ms ?? null,
    http_status: health.http_status ?? null,
    geo_country: health.geo_country ?? null,
    geo_region: health.geo_region ?? null,
    geo_city: health.geo_city ?? null,
    checked_at: health.checked_at ?? db.fn.now(),
    updated_at: db.fn.now(),
  };
  await db('proxy_health')
    .insert(payload)
    .onConflict('proxy_id')
    .merge(payload);
};

const addHistory = async (history: DB.ProxyHealthHistory) => {
  await db('proxy_health_history').insert({
    proxy_id: history.proxy_id,
    status: history.status,
    latency_ms: history.latency_ms ?? null,
    http_status: history.http_status ?? null,
    geo_country: history.geo_country ?? null,
    geo_region: history.geo_region ?? null,
    geo_city: history.geo_city ?? null,
    checked_at: history.checked_at ?? db.fn.now(),
    created_at: history.created_at ?? db.fn.now(),
  });
};

const getLatestByProxyId = async (proxyId: number) => {
  return await db('proxy_health').where({proxy_id: proxyId}).first();
};

const getHistoryByProxyId = async (proxyId: number, limit = 50) => {
  return await db('proxy_health_history')
    .where({proxy_id: proxyId})
    .orderBy('checked_at', 'desc')
    .limit(limit);
};

const getAllLatest = async () => {
  return await db('proxy_health').select('*');
};

export const ProxyHealthDB = {
  upsertHealth,
  addHistory,
  getLatestByProxyId,
  getHistoryByProxyId,
  getAllLatest,
};
