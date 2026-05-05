import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchJobDetail, fetchJobList, fetchJobPlatforms, fetchJobSummary } from "@/lib/api";

export function useJobSummaryQuery() {
  return useQuery({
    queryKey: ["jobSummary"],
    queryFn: fetchJobSummary,
    staleTime: 60_000,
  });
}

export function useJobPlatformsQuery() {
  return useQuery({
    queryKey: ["jobPlatforms"],
    queryFn: fetchJobPlatforms,
    staleTime: 300_000,
  });
}

export function useJobInfiniteQuery(params: {
  pageSize: number;
  platform?: string;
  applyStatus?: string;
  search?: string;
}) {
  return useInfiniteQuery({
    queryKey: [
      "jobListInfinite",
      params.pageSize,
      params.platform ?? "",
      params.applyStatus ?? "",
      params.search ?? "",
    ],
    queryFn: ({ pageParam }) =>
      fetchJobList({
        page: pageParam,
        pageSize: params.pageSize,
        platform: params.platform,
        applyStatus: params.applyStatus,
        search: params.search,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });
}

export function useJobDetailQuery(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["jobDetail", jobId],
    queryFn: () => fetchJobDetail(jobId!),
    enabled: Boolean(jobId && enabled),
  });
}
