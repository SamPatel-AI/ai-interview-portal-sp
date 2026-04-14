export const activityKeys = {
  all: ['activity'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...activityKeys.lists(), filters] as const,
  filters: () => [...activityKeys.all, 'filters'] as const,
};
