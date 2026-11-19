import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AdvanceJobResponse, GetJobResponse, WorkspaceResponse } from '@tome/shared';
import { useGeneration } from './useGeneration';
import { ApiRequestError } from '../../../shared/api';
import { COPY } from '../../../shared/copy';

const api = vi.hoisted(() => ({
  getJob: vi.fn<(jobId: string) => Promise<GetJobResponse>>(),
  advanceJob:
    vi.fn<(jobId: string, stage: import('@tome/shared').JobStage) => Promise<AdvanceJobResponse>>(),
}));
vi.mock('../../../shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/api')>();
  return { ...original, api: { ...original.api, ...api } };
});

const projectId = '00000000-0000-4000-8000-000000000001';
const pageId = '00000000-0000-4000-8000-000000000002';
const setId = '00000000-0000-4000-8000-000000000003';
const jobId = '00000000-0000-4000-8000-000000000004';
const job = {
  setId,
  pageId,
  id: jobId,
  status: 'running' as const,
  startStage: 'analyze' as const,
  nextStage: 'verify' as const,
  steps: [{ stage: 'image' as const, status: 'succeeded' as const }],
};
const workspace: WorkspaceResponse = {
  project: {
    id: projectId,
    title: 'Test project',
    status: 'building',
    posted: false,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-01T00:00:00Z',
    shelfPosition: 0,
    kind: 'original',
  },
  pages: [{ id: pageId, index: 0, setCount: 1 }],
  currentPageId: pageId,
  sets: [{ id: setId, position: 1, prompt: 'Lamp', latestAnswer: null, answers: [] }],
  activeJob: job,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
describe('workspace boundary', () => {
  it('updates page-specific keys and invalidates their shared prefix on completion', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherPage = { ...workspace, currentPageId: 'other-page' };
    client.setQueryData(['workspace', projectId], workspace);
    client.setQueryData(['workspace', projectId, pageId], workspace);
    client.setQueryData(['workspace', projectId, 'other-page'], otherPage);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.spyOn(api, 'getJob').mockResolvedValue({ job, steps: [] });
    vi.spyOn(api, 'advanceJob').mockResolvedValue({
      job: {
        ...job,
        status: 'succeeded',
        nextStage: null,
        steps: [{ stage: 'verify', status: 'skipped' }],
      },
      step: {
        stage: 'verify',
        status: 'skipped',
        verification: { status: 'skipped', criteria: [], mismatches: [] },
        provider: null,
        fallbackUsed: false,
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useGeneration(projectId, pageId, workspace), {
      wrapper,
    });
    await waitFor(() => expect(result.current.announcement).toBe('Step 5 of 5 done'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace', projectId] });
    expect(
      client.getQueryData<WorkspaceResponse>(['workspace', projectId, pageId])?.activeJob,
    ).toBeUndefined();
    expect(
      client.getQueryData<WorkspaceResponse>(['workspace', projectId])?.activeJob,
    ).toBeUndefined();
    expect(client.getQueryData(['workspace', projectId, 'other-page'])).toEqual(otherPage);
    unmount();
    client.clear();
  });
  it('does not write a late stage response after the page unmounts', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['workspace', projectId, pageId], workspace);
    vi.spyOn(api, 'getJob').mockResolvedValue({ job, steps: [] });
    let finish!: (value: Awaited<ReturnType<typeof api.advanceJob>>) => void;
    const advance = vi.spyOn(api, 'advanceJob').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useGeneration(projectId, pageId, workspace), { wrapper });
    await waitFor(() => expect(advance).toHaveBeenCalledOnce());
    unmount();
    finish({
      job: { ...job, status: 'succeeded', nextStage: null },
      step: { stage: 'verify', status: 'skipped', provider: null, fallbackUsed: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      client.getQueryData<WorkspaceResponse>(['workspace', projectId, pageId])?.activeJob?.id,
    ).toBe(jobId);
    client.clear();
  });
});

it.each(['missing identifiers', 'another page', 'unknown set'])(
  'does not attach or advance a job with %s',
  async (scenario) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const response: GetJobResponse = {
      job:
        scenario === 'missing identifiers'
          ? ({
              id: jobId,
              status: 'running',
              startStage: 'analyze',
              nextStage: 'verify',
              steps: [],
            } as unknown as GetJobResponse['job'])
          : {
              ...job,
              ...(scenario === 'another page'
                ? { pageId: 'other-page' }
                : { setId: 'unknown-set' }),
            },
      steps: [],
    };
    api.getJob.mockResolvedValue(response);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useGeneration(projectId, pageId, workspace), {
      wrapper,
    });
    await waitFor(() =>
      expect(client.getQueryData(['generation', projectId, pageId, jobId])).toEqual(response),
    );
    expect(api.advanceJob).not.toHaveBeenCalled();
    expect(result.current.generation).toBeUndefined();
    expect(result.current.busy).toBe(true);
    unmount();
    client.clear();
  },
);

it.each(['DAILY_LIMIT_REACHED', 'BUDGET_REACHED'] as const)(
  'shows the limit notice without Retry for %s and keeps prior output',
  async (code) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const output = {
      stage: 'analyze' as const,
      status: 'succeeded' as const,
      provider: null,
      fallbackUsed: false,
      nodes: [
        {
          id: 'k1',
          kind: 'keyword' as const,
          stage: 'analyze' as const,
          text: 'Lamp',
          enabled: true,
          parentIds: [],
        },
      ],
    };
    const saved: GetJobResponse = { job: { ...job, nextStage: 'research' }, steps: [output] };
    api.getJob.mockResolvedValue(saved);
    api.advanceJob.mockRejectedValue(
      new ApiRequestError(429, { code, message: 'Limit reached', retryable: false }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => useGeneration(projectId, pageId, { ...workspace, activeJob: saved.job }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.generation?.error).toEqual({
        stage: 'research',
        message: COPY['C-08'],
        retryable: false,
      }),
    );
    expect(api.advanceJob).toHaveBeenCalledOnce();
    expect(result.current.generation?.steps).toContainEqual(output);
    unmount();
    client.clear();
  },
);
