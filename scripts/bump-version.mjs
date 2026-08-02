#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PACKAGE_JSON = "package.json";
const TAURI_CONF = "src-tauri/tauri.conf.json";
const CARGO_TOML = "src-tauri/Cargo.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function bump(current, kind) {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return null;
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

if (run("git status --porcelain")) {
  console.error("Working tree is not clean. Commit or stash changes first.");
  process.exit(1);
}

const semverRe = /^\d+\.\d+\.\d+$/;
const currentVersion = readJson(TAURI_CONF).version;
const newVersion = semverRe.test(arg) ? arg : bump(currentVersion, arg);

if (!newVersion || !semverRe.test(newVersion)) {
  console.error(`Invalid version or bump type: ${arg}`);
  process.exit(1);
}

const pkg = readJson(PACKAGE_JSON);
pkg.version = newVersion;
writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");

const tauriConf = readJson(TAURI_CONF);
tauriConf.version = newVersion;
writeFileSync(TAURI_CONF, JSON.stringify(tauriConf, null, 2) + "\n");

const cargoToml = readFileSync(CARGO_TOML, "utf8");
writeFileSync(
  CARGO_TOML,
  cargoToml.replace(/^version = ".*"$/m, `version = "${newVersion}"`)
);

// Cargo.lock records the crate's own version, so it must be refreshed too or
// CI's `cargo test --locked` fails on the stale entry.
run(`cargo update --manifest-path ${CARGO_TOML} --workspace --offline`);

const tag = `v${newVersion}`;
run(`git add ${PACKAGE_JSON} ${TAURI_CONF} ${CARGO_TOML} ${CARGO_LOCK}`);
run(`git commit -m "chore: bump version to ${newVersion}"`);
run(`git tag -a ${tag} -m "${tag}"`);
run("git push --follow-tags");

console.log(`Bumped version ${currentVersion} -> ${newVersion}`);
console.log(`Pushed commit and tag ${tag}`);
