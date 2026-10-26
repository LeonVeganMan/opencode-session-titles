# AGENTS.md - opencode-session-titles

## What this is

A TUI plugin for OpenCode V2 that renames the current session with an AI title
built from the user's own prompts. It listens for finished assistant runs,
counts them, and every N runs asks a one-shot model call for a short title.

npm: `opencode-session-titles` · repo: `LeonVeganMan/opencode-session-titles`

## Layout

```
tui.ts                  # Plugin.define({ id: "opencode-session-titles", setup })
src/title.ts            # Config, DEFAULTS, parseConfig, due, cleanTitle (no TUI imports)
src/title.test.ts       # bun test: 6 tests
.github/workflows/publish.yml
```

`tui.ts` wires four things:

- `context.storage`-free config read once per run from
  `~/.config/opencode/opencode-session-titles.json`
- `rename(sessionID, explicit?)`: builds the title and calls `session.update`
- a keymap command `opencode-session-titles.title` (`alt+t`, palette, `/title`)
- `context.data.on("session.execution.succeeded", ...)` for the automatic rename

## Commands

```bash
bun test
bun build tui.ts --target=node --external '*'
```

## Hard requirements

**The client takes flat arguments, not the HTTP shape.** `{ path, body }` is what
the OpenAPI spec shows; the typed client flattens it:

```ts
await context.client.session.context({ sessionID })
await context.client.generate.text({ prompt })            // string, not { prompt: {...} }
await context.client.session.update({ sessionID, title })
```

Passing `{ path: { sessionID }, body: {...} }` sends `sessionID: undefined` and
the server answers `InvalidRequestError: Invalid session ID`. Passing
`{ prompt: { prompt } }` to `generate.text` answers
`InvalidRequestError: Expected string at ["prompt"]`.

**Never use `session.generate` for the title.** It resends the whole session to
the model: on a long session that is over a million tokens and the request fails
with `maximum context length`. Only `generate.text` with a bounded prompt works.

**Bound the prompt.** The transcript is the last 12 *user* messages only, all
`text` fields flattened, cut to the last 2000 characters. Assistant replies are
noise on that budget.

**`keymap.layer()` has no disposer.** The cleanup function must not call its
result; the layer dies with the setup. Calling it throws
`layer is not a function`.

**OpenTUI theme colors are shade maps.** A `fg` prop needs a string; read
something like `theme.text.muted` or a specific shade, never the map itself.

## Config

`~/.config/opencode/opencode-session-titles.json`, all optional:

```json
{ "every": 10, "first": true, "maxLength": 40, "language": "en" }
```

- `every`: assistant runs between renames.
- `first`: rename on the first run too (otherwise only every N).
- `maxLength`: hard cut applied by `cleanTitle`.
- `language`: code (`en`, `it`) or a name; it goes into the prompt.

The file is read once per TUI run: editing it needs a restart.

## Release and install

The npm name matters. `opencode-auto-title` was rejected with
`Package name too similar to existing package opencode-autotitle`, and the
package was first published as `@leonveganman/opencode-auto-title` (now
deprecated). The live name is `opencode-session-titles`.

Trusted publishing needs the package to exist first: `npm trust github` answers
`404` for a name npm has never seen. Order is: publish once by hand with 2FA,
then `npm trust github opencode-session-titles --file publish.yml --repo
LeonVeganMan/opencode-session-titles --allow-publish -y`, then let the tag do
the rest.

`../release.sh patch|minor|major` bumps, commits, tags, pushes and waits for
`npm view` (early-exits when the version is already live). The workflow needs
npm >= 11.5.1 (setup-node 24 ships npm 10 → `ENEEDAUTH`) and
`id-token: write`; it publishes with `--provenance` and no token.

Install with `opencode plugin add opencode-session-titles`, then restart the
TUI: TUI plugins live in the client process, `service restart` is not enough.
Do not keep a clone inside `~/.config/opencode/plugins/` while the npm package
is installed, or the plugin loads twice and `alt+t` is registered twice.

## Debugging

- `opencode plugin list` shows the loaded version.
- `~/.local/share/opencode/log/opencode.log` has `component=plugin` lines; a
  failing command shows only a generic toast, so log real errors.
- The active code is the npm cache copy
  (`~/.cache/opencode/npm/opencode-session-titles@latest/<ts>/node_modules/...`),
  not the working tree: a change needs a release + `plugin update`.
