import * as path from "@std/path";

const HOOKS_DIR = ".git/hooks";
const SOURCE_DIR = ".githooks";
const HOOKS = ["pre-commit", "commit-msg"];

async function setupHooks() {
  try {
    // Ensure .git/hooks directory exists
    await Deno.mkdir(HOOKS_DIR, { recursive: true });
    console.log(`✅ Ensured ${HOOKS_DIR} exists.`);

    for (const hook of HOOKS) {
      const sourcePath = path.join(SOURCE_DIR, hook);
      const destPath = path.join(HOOKS_DIR, hook);

      try {
        // Copy the hook file
        await Deno.copyFile(sourcePath, destPath);
        console.log(`✅ Copied ${hook} to ${destPath}`);

        // Set executable permissions (chmod +x)
        // Note: Deno.chmod is a no-op on Windows
        if (Deno.build.os !== "windows") {
          await Deno.chmod(destPath, 0o755);
          console.log(`✅ Set executable permissions for ${hook}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to setup hook ${hook}:`, msg);
      }
    }

    console.log("\n✨ Git hooks setup complete!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Failed to setup hooks directory:", msg);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  setupHooks();
}
