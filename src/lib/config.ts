import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".claude-coach");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DB_FILE = join(CONFIG_DIR, "coach.db");

export interface Config {
  garmin_token_dir: string; // Path to directory containing garth oauth token files
  sync_days: number;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getDbPath(): string {
  return DB_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): Config {
  if (!configExists()) {
    throw new Error(`Config not found at ${CONFIG_FILE}. Run setup first.`);
  }
  const data = readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(data);
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function createConfig(garminTokenDir: string, syncDays = 730): Config {
  return {
    garmin_token_dir: garminTokenDir,
    sync_days: syncDays,
  };
}
