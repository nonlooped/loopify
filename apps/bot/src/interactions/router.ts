import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { handleInteractionError } from '../lib/interaction-errors.js'
import type { BotClient } from '../types/commands.js'

// Optional short-lived interaction state: ../lib/interaction-sessions (single process; use Redis for multi-shard).
//
// Per kind: exact customId -> flex routes (RegExp / parseCustomId / matchCustomId)
// sorted by interactionRoutePriority (higher first), then file load order.

function resolveComponentRoute(kindState, customId) {
  const { exact, flexRoutes } = kindState
  const direct = exact.get(customId)
  if (direct) {
    return { handler: direct, args: [] }
  }

  for (const route of flexRoutes) {
    const hit = route.tryResolve(customId)
    if (hit) {
      return { handler: hit.execute, args: hit.args }
    }
  }

  return null
}

async function loadInteractionKind(interactionsDir, subdir, ext) {
  const exact = new Map()
  const flexRoutes = []
  let flexSequence = 0
  const dir = path.join(interactionsDir, subdir)

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) {
    return { exact, flexRoutes }
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(ext)) {
      continue
    }

    const modulePath = pathToFileURL(path.join(dir, entry.name)).href
    const mod = await import(modulePath)
    if (typeof mod.execute !== 'function') {
      continue
    }

    const hasId = typeof mod.customId === 'string' && mod.customId.length > 0
    const hasRe = mod.customIdRegExp instanceof RegExp
    const hasParse = typeof mod.parseCustomId === 'function'
    const hasMatch = typeof mod.matchCustomId === 'function'

    if (hasParse && hasMatch) {
      throw new Error(
        `${subdir}/${entry.name}: export parseCustomId or matchCustomId, not both.`,
      )
    }

    const strategyCount =
      (hasId ? 1 : 0) +
      (hasRe ? 1 : 0) +
      (hasParse ? 1 : 0) +
      (hasMatch ? 1 : 0)

    if (strategyCount !== 1) {
      throw new Error(
        `${subdir}/${entry.name}: export exactly one of customId, customIdRegExp, parseCustomId, or matchCustomId (plus execute).`,
      )
    }

    if (hasId) {
      exact.set(mod.customId, mod.execute)
      continue
    }

    const priority = Number(mod.interactionRoutePriority) || 0
    const order = flexSequence++

    if (hasRe) {
      flexRoutes.push({
        priority,
        order,
        tryResolve(customId) {
          const m = mod.customIdRegExp.exec(customId)
          if (!m || m[0] !== customId) {
            return null
          }
          return { execute: mod.execute, args: [m] }
        },
      })
      continue
    }

    if (hasParse) {
      flexRoutes.push({
        priority,
        order,
        tryResolve(customId) {
          const parsed = mod.parseCustomId(customId)
          if (parsed == null) {
            return null
          }
          return { execute: mod.execute, args: [parsed] }
        },
      })
      continue
    }

    flexRoutes.push({
      priority,
      order,
      tryResolve(customId) {
        if (!mod.matchCustomId(customId)) {
          return null
        }
        return { execute: mod.execute, args: [] }
      },
    })
  }

  flexRoutes.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority
    }
    return a.order - b.order
  })

  return { exact, flexRoutes }
}

export async function registerInteractionHandlers(client: BotClient) {
  const interactionsDir = path.dirname(fileURLToPath(import.meta.url))
  const ext = '.ts'
  const modal = await loadInteractionKind(interactionsDir, 'modals', ext)
  const button = await loadInteractionKind(interactionsDir, 'buttons', ext)
  const stringSelect = await loadInteractionKind(
    interactionsDir,
    'selectMenus',
    ext,
  )

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName)
        if (command?.autocomplete) {
          await command.autocomplete(interaction)
        } else {
          await interaction.respond([])
        }
        return
      }

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName)
        if (!command) {
          await interaction.reply({
            content: 'This command is not registered in the runtime.',
            ephemeral: true,
          })
          return
        }

        await command.execute(interaction)
        return
      }

      if (
        interaction.isUserContextMenuCommand() ||
        interaction.isMessageContextMenuCommand()
      ) {
        const command = client.commands.get(interaction.commandName)
        if (!command) {
          await interaction.reply({
            content: 'This command is not registered in the runtime.',
            ephemeral: true,
          })
          return
        }

        await command.execute(interaction)
        return
      }

      if (interaction.isModalSubmit()) {
        const resolved = resolveComponentRoute(modal, interaction.customId)
        if (resolved) {
          await resolved.handler(interaction, ...resolved.args)
        }
        return
      }

      if (interaction.isButton()) {
        const resolved = resolveComponentRoute(button, interaction.customId)
        if (resolved) {
          await resolved.handler(interaction, ...resolved.args)
        }
        return
      }

      if (interaction.isStringSelectMenu()) {
        const resolved = resolveComponentRoute(
          stringSelect,
          interaction.customId,
        )
        if (resolved) {
          await resolved.handler(interaction, ...resolved.args)
        }
      }
    } catch (error) {
      await handleInteractionError(interaction, error)
    }
  })
}
