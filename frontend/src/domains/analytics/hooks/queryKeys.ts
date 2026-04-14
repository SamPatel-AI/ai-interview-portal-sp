export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: () => [...analyticsKeys.all, 'overview'] as const,
  recruiter: (id: string) => [...analyticsKeys.all, 'recruiter', id] as const,
  recruiters: () => [...analyticsKeys.all, 'recruiters'] as const,
  job: (id: string) => [...analyticsKeys.all, 'job', id] as const,
  agent: (id: string) => [...analyticsKeys.all, 'agent', id] as const,
};
