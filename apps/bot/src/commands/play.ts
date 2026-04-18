import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play any song in a voice channel');

export async function execute(interaction: import("discord.js").ChatInputCommandInteraction) {
  await interaction.reply('play is wired up.');
}
