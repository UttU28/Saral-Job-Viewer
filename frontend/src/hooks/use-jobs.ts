import { useQuery } from "@tanstack/react-query";
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

export function useJobListQuery(params: {
  page: number;
  pageSize: number;
  platform?: string;
  applyStatus?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: [
      "jobList",
      params.page,
      params.pageSize,
      params.platform ?? "",
      params.applyStatus ?? "",
      params.search ?? "",
    ],
    queryFn: () => fetchJobList(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useJobDetailQuery(jobId: string | null, open: boolean) {
  return useQuery({
    queryKey: ["jobDetail", jobId],
    queryFn: () => fetchJobDetail(jobId!),
    enabled: Boolean(jobId && open),
  });
}
