import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const version = "4.53.5";
const platform = process.platform;
const arch = process.arch;

const useMusl = (() => {
  if (process.env.LIBC === "musl") return true;
  if (process.env.LIBC === "gnu") return false;
  if (platform !== "linux") return false;
  return existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1");
})();

const linuxPackage = (suffix) => `@rollup/rollup-linux-${suffix}@${version}`;
// eslint-disable-next-line prefer-const
const platformMap = {
  "darwin-x64": `@rollup/rollup-darwin-x64@${version}`,
  "darwin-arm64": `@rollup/rollup-darwin-arm64@${version}`,
  "linux-x64": linuxPackage(useMusl ? "x64-musl" : "x64-gnu"),
  "linux-arm64": linuxPackage(useMusl ? "arm64-musl" : "arm64-gnu"),
};

const pkg = platformMap[`${platform}-${arch}`] || null;
if (!pkg) {
  console.log(`Skipping rollup native install for ${platform}-${arch}`);
  process.exit(0);
}

try {
  console.log(`Installing ${pkg} for rollup native bindings`);
  execSync(`npm install ${pkg} --no-save`, { stdio: "inherit" });
} catch (err) {
  console.warn(`Optional rollup native install failed for package ${pkg}:`, err.message);
}
