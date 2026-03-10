import { configExists, loadConfig, saveConfig, getDbPath, createConfig } from "./lib/config.js";
import { log } from "./lib/logging.js";
import { migrate } from "./db/migrate.js";
import { execute, initDatabase, query, queryJson } from "./db/client.js";
import type { GarminActivity, GarminSocialProfile } from "./garmin/types.js";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Proxy Configuration
// ============================================================================

// Configure proxy for fetch() if HTTP_PROXY or HTTPS_PROXY is set
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface SyncArgs {
  command: "sync";
  tokenDir?: string;
  days?: number;
}

interface RenderArgs {
  command: "render";
  inputFile: string;
  outputFile?: string;
}

interface QueryArgs {
  command: "query";
  sql: string;
  json: boolean;
}

interface HelpArgs {
  command: "help";
}

type CliArgs = SyncArgs | RenderArgs | QueryArgs | HelpArgs;

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "sync") {
    const syncArgs: SyncArgs = { command: "sync" };

    for (const arg of args) {
      if (arg.startsWith("--token-dir=")) {
        syncArgs.tokenDir = arg.slice("--token-dir=".length);
      } else if (arg.startsWith("--days=")) {
        syncArgs.days = parseInt(arg.split("=")[1]);
      }
    }

    return syncArgs;
  }

  if (args[0] === "render") {
    if (!args[1]) {
      log.error("render command requires an input file");
      process.exit(1);
    }

    const renderArgs: RenderArgs = {
      command: "render",
      inputFile: args[1],
    };

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--output" || args[i] === "-o") {
        renderArgs.outputFile = args[i + 1];
        i++;
      } else if (args[i].startsWith("--output=")) {
        renderArgs.outputFile = args[i].split("=")[1];
      }
    }

    return renderArgs;
  }

  if (args[0] === "query") {
    if (!args[1]) {
      log.error("query command requires a SQL statement");
      process.exit(1);
    }

    const queryArgs: QueryArgs = {
      command: "query",
      sql: args[1],
      json: args.includes("--json"),
    };

    return queryArgs;
  }

  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return { command: "help" };
  }

  log.error(`Unknown command: ${args[0]}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`
Claude Coach - Training Plan Tools

Usage: npx claude-coach <command> [options]

Commands:
  sync              Sync activities from Garmin Connect
  render <file>     Render a training plan JSON to HTML
  query <sql>       Run a SQL query against the database
  help              Show this help message

Sync Options:
  --token-dir=PATH  Path to garth OAuth token directory (default: /mnt/project)
  --days=N          Days of history to sync (default: 730)

  Requires: Python 3 with garth installed (pip install garth)
  Token files needed: oauth1_token.json and oauth2_token.json in token-dir

Render Options:
  --output, -o FILE     Output HTML file (default: <input>.html)

Query Options:
  --json                Output as JSON (default: plain text)

Examples:
  # Sync Garmin Connect activities
  npx claude-coach sync
  npx claude-coach sync --token-dir=/path/to/tokens --days=365

  # Render a training plan to HTML
  npx claude-coach render plan.json --output my-plan.html

  # Query the database
  npx claude-coach query "SELECT * FROM weekly_volume LIMIT 5"
`);
}

// ============================================================================
// Sync Command
// ============================================================================

function escapeString(str: string | null | undefined): string {
  if (str == null) return "NULL";
  return `'${str.replace(/'/g, "''")}'`;
}

function getSyncScriptPath(): string {
  const locations = [
    join(__dirname, "garmin", "sync.py"),
    join(__dirname, "..", "src", "garmin", "sync.py"),
    join(process.cwd(), "src", "garmin", "sync.py"),
  ];

  for (const loc of locations) {
    try {
      readFileSync(loc);
      return loc;
    } catch {
      // Continue to next location
    }
  }

  throw new Error("Could not find garmin/sync.py script");
}

function runPythonSync(
  scriptPath: string,
  tokenDir: string,
  days: number,
  command: string
): string {
  try {
    const output = execSync(`python3 ${scriptPath} ${tokenDir} ${days} ${command}`, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large activity lists
      stdio: ["pipe", "pipe", "inherit"], // inherit stderr so progress shows in terminal
    });
    return output.toString();
  } catch (err: unknown) {
    const error = err as { message?: string };
    throw new Error(`Python sync failed: ${error.message ?? String(err)}`);
  }
}

function insertActivity(activity: GarminActivity): void {
  const sportType = activity.activityType?.typeKey ?? "other";

  // Convert "YYYY-MM-DD HH:MM:SS" GMT to ISO 8601 with Z suffix
  const startDate = activity.startTimeGMT ? activity.startTimeGMT.replace(" ", "T") + "Z" : null;

  // Cadence field varies by sport type
  const avgCadence =
    activity.averageRunningCadenceInStepsPerMinute ??
    activity.averageBikingCadenceInRevPerMinute ??
    activity.averageSwimmingCadenceInStrokesPerMinute ??
    null;

  // Estimate kilojoules from average power * moving duration
  const kilojoules =
    activity.averagePower && activity.movingDuration
      ? (activity.averagePower * activity.movingDuration) / 1000
      : null;

  const sql = `
    INSERT OR REPLACE INTO activities (
      id, name, sport_type, start_date, elapsed_time, moving_time,
      distance, total_elevation_gain, average_speed, max_speed,
      average_heartrate, max_heartrate, average_watts, max_watts,
      weighted_average_watts, kilojoules, suffer_score, average_cadence,
      calories, description, workout_type, gear_id, raw_json, synced_at
    ) VALUES (
      ${activity.activityId},
      ${escapeString(activity.activityName)},
      ${escapeString(sportType)},
      ${escapeString(startDate)},
      ${activity.duration ?? "NULL"},
      ${activity.movingDuration ?? "NULL"},
      ${activity.distance ?? "NULL"},
      ${activity.elevationGain ?? "NULL"},
      ${activity.averageSpeed ?? "NULL"},
      ${activity.maxSpeed ?? "NULL"},
      ${activity.averageHR ?? "NULL"},
      ${activity.maxHR ?? "NULL"},
      ${activity.averagePower ?? "NULL"},
      ${activity.maxPower ?? "NULL"},
      ${activity.normPower ?? "NULL"},
      ${kilojoules ?? "NULL"},
      NULL,
      ${avgCadence ?? "NULL"},
      ${activity.calories ?? "NULL"},
      ${escapeString(activity.description)},
      NULL,
      NULL,
      ${escapeString(JSON.stringify(activity))},
      datetime('now')
    );
  `;

  execute(sql);
}

function insertAthlete(profile: GarminSocialProfile): void {
  const nameParts = (profile.fullName ?? profile.displayName ?? "").trim().split(/\s+/);
  const firstname = nameParts[0] ?? "";
  const lastname = nameParts.slice(1).join(" ");

  // Garmin stores weight in grams; convert to kg
  const weightKg = profile.weight ? profile.weight / 1000 : null;

  const sql = `
    INSERT OR REPLACE INTO athlete (id, firstname, lastname, weight, ftp, raw_json, updated_at)
    VALUES (
      ${profile.profileId},
      ${escapeString(firstname)},
      ${escapeString(lastname)},
      ${weightKg ?? "NULL"},
      NULL,
      ${escapeString(JSON.stringify(profile))},
      datetime('now')
    );
  `;
  execute(sql);
}

async function runSync(args: SyncArgs): Promise<void> {
  log.box("Claude Coach - Garmin Connect Sync");

  await initDatabase();
  migrate();

  const syncDays = args.days || (configExists() ? loadConfig().sync_days : 730) || 730;

  // Determine token directory
  let tokenDir = args.tokenDir;
  if (!tokenDir) {
    if (configExists()) {
      tokenDir = loadConfig().garmin_token_dir;
    } else {
      tokenDir = "/mnt/project";
    }
  }

  // Save config with resolved values for future runs
  if (!configExists()) {
    const config = createConfig(tokenDir, syncDays);
    saveConfig(config);
  }

  const scriptPath = getSyncScriptPath();

  // Fetch and store athlete profile
  log.start("Fetching athlete profile from Garmin Connect...");
  const profileJson = runPythonSync(scriptPath, tokenDir, syncDays, "profile");
  const profile: GarminSocialProfile = JSON.parse(profileJson);
  insertAthlete(profile);
  const displayName = profile.fullName ?? profile.displayName;
  log.success(`Athlete: ${displayName}`);

  // Fetch activities
  log.start(`Fetching activities since ${syncDays} days ago...`);
  const activitiesJson = runPythonSync(scriptPath, tokenDir, syncDays, "activities");
  const activities: GarminActivity[] = JSON.parse(activitiesJson);
  log.success(`Fetched ${activities.length} activities total`);

  // Store activities
  log.start("Storing activities in database...");
  let count = 0;
  for (const activity of activities) {
    insertActivity(activity);
    count++;
    if (count % 50 === 0) {
      log.progress(`   Stored ${count}/${activities.length}...`);
    }
  }
  log.progressEnd();
  log.success(`Stored ${activities.length} activities`);

  execute(`
    INSERT INTO sync_log (started_at, completed_at, activities_synced, status)
    VALUES (datetime('now'), datetime('now'), ${activities.length}, 'success');
  `);

  log.info(`Database: ${getDbPath()}`);
  log.ready("Sync complete! You can now create training plans.");
}

// ============================================================================
// Render Command
// ============================================================================

function getTemplatePath(): string {
  const locations = [
    join(__dirname, "..", "templates", "plan-viewer.html"),
    join(__dirname, "..", "..", "templates", "plan-viewer.html"),
    join(process.cwd(), "templates", "plan-viewer.html"),
  ];

  for (const loc of locations) {
    try {
      readFileSync(loc);
      return loc;
    } catch {
      // Continue to next location
    }
  }

  throw new Error("Could not find plan-viewer.html template");
}

function runRender(args: RenderArgs): void {
  log.start("Rendering training plan...");

  let planJson: string;
  try {
    planJson = readFileSync(args.inputFile, "utf-8");
  } catch {
    log.error(`Could not read input file: ${args.inputFile}`);
    process.exit(1);
  }

  try {
    JSON.parse(planJson);
  } catch {
    log.error("Input file is not valid JSON");
    process.exit(1);
  }

  const templatePath = getTemplatePath();
  let template = readFileSync(templatePath, "utf-8");

  const planDataRegex = /<script type="application\/json" id="plan-data">[\s\S]*?<\/script>/;
  const newPlanData = `<script type="application/json" id="plan-data">\n${planJson}\n</script>`;
  template = template.replace(planDataRegex, newPlanData);

  if (args.outputFile) {
    writeFileSync(args.outputFile, template);
    log.success(`Training plan rendered to: ${args.outputFile}`);
  } else {
    console.log(template);
  }
}

// ============================================================================
// Query Command
// ============================================================================

async function runQuery(args: QueryArgs): Promise<void> {
  await initDatabase();
  migrate();

  if (args.json) {
    const results = queryJson(args.sql);
    console.log(JSON.stringify(results, null, 2));
  } else {
    const result = query(args.sql);
    console.log(result);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs();

  switch (args.command) {
    case "help":
      printHelp();
      break;
    case "sync":
      await runSync(args);
      break;
    case "render":
      runRender(args);
      break;
    case "query":
      await runQuery(args);
      break;
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
