import { SlashCommandBuilder } from 'discord.js'

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether the bot is responding.')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  await interaction.reply('ping is wired up.')
}
