import path from 'path';
import config from '../config.js';

const resolveRuntimePath = (value, fallback) => {
    const candidate = value || fallback;
    return path.isAbsolute(candidate)
        ? candidate
        : path.join(process.cwd(), candidate);
};

export const DATA_DIR = resolveRuntimePath(config.dataDir, 'data');
export const ASSETS_DIR = path.join(process.cwd(), 'assets');
export const TEMP_DIR = resolveRuntimePath(config.tempDir, 'temp');
export const SESSION_DIR = resolveRuntimePath(config.sessionsDir, 'sessions');
export const dataFile = (filename) => path.join(DATA_DIR, filename);
