/**
 * Post-install script — shows welcome message after global install.
 */

const isGlobal = process.env.npm_config_global === "true" ||
  process.argv.includes("--global") ||
  (process.env._ && process.env._.includes("npx"));

if (isGlobal || !process.env.npm_config_global) {
  console.log(`
  Wispy installed successfully!

  Get started:
    $ wispy setup       # Interactive setup wizard
    $ wispy chat        # Start chatting
    $ wispy doctor      # Health check

  Docs: https://github.com/brn-mwai/wispy
`);
}
