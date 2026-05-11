export const reengagementKeys = {
  all: ['reengagement'] as const,
  lists: () => [...reengagementKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...reengagementKeys.lists(), filters] as const,
  details: () => [...reengagementKeys.all, 'detail'] as const,
  detail: (id: string) => [...reengagementKeys.details(), id] as const,
};
