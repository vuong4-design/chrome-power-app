import express from 'express';
import {ProxyDB} from '/@/db/proxy';
import {ProxyHealthDB} from '/@/db/proxy-health';
import type {DB} from '../../../../shared/types/db';

const router = express.Router();

router.get('/info', async (req, res) => {
  const {proxyId} = req.query;
  if (!proxyId) {
    res.send({success: false, message: 'proxyId is required.'});
    return;
  }

  const proxyData = await ProxyDB.getById(Number(proxyId));
  res.send(proxyData);
});

router.get('/all', async (_, res) => {
  const proxies = await ProxyDB.all();
  res.json(proxies);
});

router.get('/health', async (_req, res) => {
  const proxies = await ProxyDB.all();
  const healthRows = await ProxyHealthDB.getAllLatest();
  const healthMap = new Map(healthRows.map(row => [row.proxy_id, row]));
  const data = proxies.map(proxy => ({
    ...proxy,
    health: healthMap.get(proxy.id),
  }));
  res.status(200).json({success: true, data});
});

router.post('/create', async (req, res) => {
  const proxy = req.body as DB.Proxy;
  const result = await ProxyDB.create(proxy);
  res.send({
    success: result.length,
    id: result[0],
  });
});

router.put('/update', async (req, res) => {
  const {id, proxy} = req.body;
  const result = await ProxyDB.update(id, proxy);
  res.send({
    success: result === 1,
  });
});

router.delete('/delete', async (req, res) => {
  const {proxyId} = req.query;
  if (!proxyId) {
    res.send({success: false, message: 'proxyId is required.'});
    return;
  }
  const result = await ProxyDB.remove(Number(proxyId));
  res.send({
    success: result === 1,
  });
});

export default router;
