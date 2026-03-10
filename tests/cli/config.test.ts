import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Config", () => {
  const testDir = join(tmpdir(), "claude-coach-test-" + Date.now());
  const configFile = join(testDir, "config.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("config file operations", () => {
    it("should write and read config correctly", () => {
      const config = {
        garmin_token_dir: "/mnt/project",
        sync_days: 730,
      };

      writeFileSync(configFile, JSON.stringify(config, null, 2));

      expect(existsSync(configFile)).toBe(true);

      const loaded = JSON.parse(readFileSync(configFile, "utf-8"));
      expect(loaded.garmin_token_dir).toBe("/mnt/project");
      expect(loaded.sync_days).toBe(730);
    });

    it("should accept custom token directory", () => {
      const config = {
        garmin_token_dir: "/home/user/.garth",
        sync_days: 365,
      };

      writeFileSync(configFile, JSON.stringify(config, null, 2));

      const loaded = JSON.parse(readFileSync(configFile, "utf-8"));
      expect(loaded.garmin_token_dir).toBe("/home/user/.garth");
      expect(loaded.sync_days).toBe(365);
    });
  });
});
