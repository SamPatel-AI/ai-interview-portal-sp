export const settingsKeys = {
  all: ['settings'] as const,
  team: () => [...settingsKeys.all, 'team'] as const,
  scheduling: () => [...settingsKeys.all, 'scheduling'] as const,
};
