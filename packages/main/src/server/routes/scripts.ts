import express from 'express';
import {AutomationDB} from '/@/db/automation';
import type {DB} from '../../../../shared/types/db';

type ValidationResult<T> = {success: true; data: T} | {success: false; error: string};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseId = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseScriptInput = (body: unknown): ValidationResult<DB.AutomationScript> => {
  if (!isRecord(body)) {
    return {success: false, error: 'Body must be an object.'};
  }
  const name = body.name;
  const type = body.type;
  const content = body.content ?? null;
  const path = body.path ?? null;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return {success: false, error: 'name is required.'};
  }
  if (typeof type !== 'string' || type.trim().length === 0) {
    return {success: false, error: 'type is required.'};
  }
  if (content !== null && content !== undefined && typeof content !== 'string') {
    return {success: false, error: 'content must be a string.'};
  }
  if (path !== null && path !== undefined && typeof path !== 'string') {
    return {success: false, error: 'path must be a string.'};
  }
  if (!content && !path) {
    return {success: false, error: 'Either content or path is required.'};
  }

  return {
    success: true,
    data: {
      name: name.trim(),
      type: type.trim(),
      content: content ? content : null,
      path: path ? path : null,
    },
  };
};

const parseScriptUpdateInput = (
  body: unknown,
): ValidationResult<Partial<DB.AutomationScript>> => {
  if (!isRecord(body)) {
    return {success: false, error: 'Body must be an object.'};
  }

  const update: Partial<DB.AutomationScript> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return {success: false, error: 'name must be a non-empty string.'};
    }
    update.name = body.name.trim();
  }

  if (body.type !== undefined) {
    if (typeof body.type !== 'string' || body.type.trim().length === 0) {
      return {success: false, error: 'type must be a non-empty string.'};
    }
    update.type = body.type.trim();
  }

  if (body.content !== undefined) {
    if (body.content !== null && typeof body.content !== 'string') {
      return {success: false, error: 'content must be a string.'};
    }
    update.content = body.content ?? null;
  }

  if (body.path !== undefined) {
    if (body.path !== null && typeof body.path !== 'string') {
      return {success: false, error: 'path must be a string.'};
    }
    update.path = body.path ?? null;
  }

  if (Object.keys(update).length === 0) {
    return {success: false, error: 'At least one field must be provided.'};
  }

  if (update.content === null && update.path === null) {
    return {success: false, error: 'Either content or path is required.'};
  }

  return {success: true, data: update};
};

const parseRunInput = (
  body: unknown,
): ValidationResult<{scriptId: number; windowIds: number[]}> => {
  if (!isRecord(body)) {
    return {success: false, error: 'Body must be an object.'};
  }
  const scriptId = body.scriptId;
  const windowIds = body.windowIds;

  if (typeof scriptId !== 'number' || !Number.isInteger(scriptId) || scriptId <= 0) {
    return {success: false, error: 'scriptId must be a positive integer.'};
  }
  if (!Array.isArray(windowIds) || windowIds.length === 0) {
    return {success: false, error: 'windowIds must be a non-empty array.'};
  }
  const parsedWindowIds = windowIds.filter(
    (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0,
  );
  if (parsedWindowIds.length !== windowIds.length) {
    return {success: false, error: 'windowIds must contain positive integers only.'};
  }

  return {success: true, data: {scriptId, windowIds: parsedWindowIds}};
};

const router = express.Router();

router.get('/', async (_req, res) => {
  const scripts = await AutomationDB.allScripts();
  res.status(200).json({success: true, data: scripts});
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({success: false, error: {message: 'Invalid script id.'}});
    return;
  }
  const script = await AutomationDB.getScriptById(id);
  if (!script) {
    res.status(404).json({success: false, error: {message: 'Script not found.'}});
    return;
  }
  res.status(200).json({success: true, data: script});
});

router.post('/', async (req, res) => {
  const result = parseScriptInput(req.body);
  if (!result.success) {
    res.status(400).json({success: false, error: {message: result.error}});
    return;
  }
  const {id} = await AutomationDB.createScript(result.data);
  const script = await AutomationDB.getScriptById(id);
  res.status(201).json({success: true, data: script});
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({success: false, error: {message: 'Invalid script id.'}});
    return;
  }
  const result = parseScriptUpdateInput(req.body);
  if (!result.success) {
    res.status(400).json({success: false, error: {message: result.error}});
    return;
  }
  const updated = await AutomationDB.updateScript(id, result.data);
  if (updated === 0) {
    res.status(404).json({success: false, error: {message: 'Script not found.'}});
    return;
  }
  const script = await AutomationDB.getScriptById(id);
  res.status(200).json({success: true, data: script});
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({success: false, error: {message: 'Invalid script id.'}});
    return;
  }
  const deleted = await AutomationDB.deleteScript(id);
  if (deleted === 0) {
    res.status(404).json({success: false, error: {message: 'Script not found.'}});
    return;
  }
  res.status(200).json({success: true});
});

router.post('/run', async (req, res) => {
  const result = parseRunInput(req.body);
  if (!result.success) {
    res.status(400).json({success: false, error: {message: result.error}});
    return;
  }
  const {scriptId, windowIds} = result.data;
  const script = await AutomationDB.getScriptById(scriptId);
  if (!script) {
    res.status(404).json({success: false, error: {message: 'Script not found.'}});
    return;
  }

  const runRows: DB.AutomationRunCreateInput[] = windowIds.map(windowId => ({
    script_id: scriptId,
    window_id: windowId,
    status: 'pending',
  }));

  const runIds = await AutomationDB.createRuns(runRows);
  res.status(201).json({
    success: true,
    data: {
      scriptId,
      windowIds,
      runIds,
    },
  });
});

export default router;
