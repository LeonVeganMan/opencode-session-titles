import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin/tui"
import { cleanTitle, due, parseConfig, type Config } from "./src/title"

const CONFIG_PATH = join(homedir(), ".config/opencode/opencode-session-titles.json")

// `session.generate` resends the whole session to the model, which on a long
// conversation blows past the context limit. A one-shot request with a short
// tail keeps the cost predictable, so the transcript is gathered here.
const LANGUAGE_NAMES: Record<string, string> = { en: "English", it: "Italian" }
function texts(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) texts(item, out)
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "text" && typeof nested === "string") out.push(nested)
      else texts(nested, out)
    }
  }
  return out
}

function titlePrompt(maxLength: number, language: string) {
  const name = LANGUAGE_NAMES[language] ?? language
  return [
    `Write a short ${name} title (at most ${maxLength} characters) for this conversation.`,
    'Reply with the title only: no quotes, no trailing period, no "Title:" prefix.',
  ].join(" ")
}

export default Plugin.define({
  id: "opencode-session-titles",
  setup(context) {
    let config: Config = parseConfig(null)
    const counts = new Map<string, number>()
    const busy = new Set<string>()

    // Config is read once per TUI run: editing the file needs a restart anyway.
    const loaded = readFile(CONFIG_PATH, "utf8")
      .then((raw) => {
        config = parseConfig(JSON.parse(raw))
      })
      .catch(() => {})

    async function generate(sessionID: string) {
      const tail = await context.client.session
        .context({ sessionID })
        .then((messages) => {
          // The user's own prompts carry the intent; assistant replies only add
          // noise to a 2000-character budget.
          const own = messages.filter((message) => (message as { type?: string }).type === "user")
          return texts((own.length ? own : messages).slice(-12)).join(" ").replace(/\s+/g, " ").slice(-2000)
        })
        .catch(() => "")
      const question = titlePrompt(config.maxLength, config.language)
      // generate.text takes the prompt itself, not the HTTP body shape.
      const generated = await context.client.generate.text({
        prompt: tail ? `${question}\n\nConversation tail:\n${tail}` : question,
      })
      return generated?.text ?? ""
    }

    async function rename(sessionID: string, explicit?: string) {
      if (busy.has(sessionID)) return
      busy.add(sessionID)
      try {
        const title = explicit?.trim()
          ? explicit.trim()
          : cleanTitle(await generate(sessionID), config.maxLength)
        if (!title) {
          context.ui.toast.show({ message: "Title: the model returned nothing", variant: "warning" })
          return
        }
        await context.client.session.update({ sessionID, title })
        // The toast is the only feedback the user gets: it also proves the
        // session id and the payload were accepted.
        context.ui.toast.show({ message: `Title: ${title}`, variant: "success" })
      } catch (error) {
        // A failed rename must never break the conversation: leave the old title.
        context.ui.toast.show({ message: `Title failed: ${String(error)}`, variant: "error" })
        console.error("auto-title:", String(error))
      } finally {
        busy.delete(sessionID)
      }
    }

    // `/title` renames on demand: the argument wins when given, otherwise the
    // model writes the title through the same path as the automatic rename.
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode-session-titles.title",
          title: "Rename session (AI title)",
          group: "Session",
          palette: true,
          bind: "alt+t",
          slash: { name: "title" },
          run: (input?: string) => {
            const route = context.ui.router.current()
            if (route.type !== "session") {
              context.ui.toast.show({ message: "No session open", variant: "warning" })
              return
            }
            void loaded.then(() => rename(route.sessionID, input))
          },
        },
      ],
    }))

    const off = context.data.on("session.execution.succeeded", (event) => {
      const sessionID = event.data.sessionID
      const count = (counts.get(sessionID) ?? 0) + 1
      counts.set(sessionID, count)
      void loaded.then(() => {
        if (due(count, config)) void rename(sessionID)
      })
    })

    // `keymap.layer()` has no disposer of its own: the layer dies with the setup.
    return () => off()
  },
})
