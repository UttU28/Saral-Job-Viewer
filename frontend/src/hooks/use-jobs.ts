import { useEffect, useMemo, useState } from "react";
import type { Job, JobsResponse, PlatformFilter } from "@/lib/types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";

type UseJobsOptions = {
  platform?: PlatformFilter;
  search?: string;
  limit?: number;
  offset?: number;
};

function buildJobsUrl(options: UseJobsOptions): string {
  const params = new URLSearchParams();
  if (options.platform && options.platform !== "All") {
    params.set("platform", options.platform);
  }
  if (options.search) {
    params.set("q", options.search);
  }
  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));
  const query = params.toString();
  return `${API_BASE_URL}/api/jobs${query ? `?${query}` : ""}`;
}

export function useJobs(options: UseJobsOptions) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const requestUrl = useMemo(
    () => buildJobsUrl(options),
    [options.platform, options.search, options.limit, options.offset]
  );

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      setIsError(false);
      try {
        const response = await fetch(requestUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch jobs (${response.status})`);
        }
        const data = (await response.json()) as JobsResponse;
        if (!isActive) {
          return;
        }
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      } catch (error) {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        console.error(error);
        setIsError(true);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [requestUrl]);

  return { jobs, total, isLoading, isError };
}
