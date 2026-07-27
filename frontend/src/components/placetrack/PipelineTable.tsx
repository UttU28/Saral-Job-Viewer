import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { OpenMailBuilderButton } from "@/components/placetrack/OpenMailBuilderButton";
import { VendorDraftButton } from "@/components/placetrack/VendorDraftButton";
import { VendorSendButton } from "@/components/placetrack/VendorSendButton";
import { VendorNameCopy } from "@/components/placetrack/VendorNameCopy";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PipelineItem, PipelineThread } from "@/lib/placetrack/pipeline-types";
import { isSentVendor } from "@/lib/placetrack/sent-recipients";
import { lookupPsName } from "@/lib/placetrack/ps-lookup";
import { resolveVendorCompany } from "@/lib/placetrack/vendor-lookup";
import { cn } from "@/lib/utils";

function statusDot(status: string) {
  const key = status.toLowerCase();
  if (key === "green") return "bg-emerald-400";
  if (key === "red") return "bg-red-400";
  if (key === "yellow" || key === "amber") return "bg-amber-400";
  return "bg-white/30";
}

function formatRate(rate: string | null): string {
  if (!rate || rate === "—") return "—";
  return rate;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ThreadBlock({ thread }: { thread: PipelineThread }) {
  return (
    <div className="border-l-2 border-primary/30 py-2 pl-3">
      <p className="text-xs font-medium text-foreground/90">{thread.subject}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{thread.role_discussed}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", statusDot(thread.status))} />
        <span>{thread.message_count} msgs</span>
        {thread.rate ? <span className="text-amber-400/90">{thread.rate}</span> : null}
        <span>{formatDate(thread.last_activity_at)}</span>
      </div>
    </div>
  );
}

type PipelineTableProps = {
  items: PipelineItem[];
  emailToPs: Map<string, string>;
  vendorDomainToCompany: Map<string, string>;
  sentRecipients?: Set<string>;
};

export function PipelineTable({
  items,
  emailToPs,
  vendorDomainToCompany,
  sentRecipients = new Set(),
}: PipelineTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="glass-card overflow-hidden rounded-xl border border-white/10">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/8 hover:bg-transparent">
              <TableHead className="h-9 w-8 px-2" />
              <TableHead className="h-9 min-w-[180px] text-[11px] uppercase tracking-wider">Role</TableHead>
              <TableHead className="h-9 min-w-[100px] text-[11px] uppercase tracking-wider">Client</TableHead>
              <TableHead className="h-9 min-w-[160px] text-[11px] uppercase tracking-wider">Vendor</TableHead>
              <TableHead className="h-9 min-w-[100px] text-[11px] uppercase tracking-wider">PS</TableHead>
              <TableHead className="h-9 w-[60px] text-[11px] uppercase tracking-wider">Tech</TableHead>
              <TableHead className="h-9 min-w-[100px] text-right text-[11px] uppercase tracking-wider">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const open = expandedId === item.id;
              const hasThreads = item.threads.length > 0;
              const psName = lookupPsName(item.account_email, emailToPs);
              const vendorCompany = resolveVendorCompany(item, vendorDomainToCompany);
              const vendorEmailed = isSentVendor(item.vendor_email, sentRecipients);

              return (
                <Fragment key={item.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer border-white/5 text-sm hover:bg-white/[0.03]",
                      open && "bg-white/[0.02]",
                    )}
                    onClick={() => hasThreads && toggle(item.id)}
                  >
                    <TableCell className="px-2 py-2.5">
                      {hasThreads ? (
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusDot(item.status))} />
                        <span className="line-clamp-2 text-sm font-medium leading-snug">{item.canonical_role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <p className="text-sm text-muted-foreground">{item.client_company || "—"}</p>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="space-y-0.5 text-xs">
                        {item.vendor_email ? (
                          <div className="inline-flex max-w-full items-center gap-1">
                            <VendorNameCopy
                              name={item.vendor_name}
                              email={item.vendor_email}
                              emailed={vendorEmailed}
                            />
                            <OpenMailBuilderButton email={item.vendor_email} name={item.vendor_name} />
                            <VendorDraftButton email={item.vendor_email} name={item.vendor_name} />
                            <VendorSendButton email={item.vendor_email} name={item.vendor_name} />
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "text-sm font-medium",
                              vendorEmailed ? "text-emerald-400" : "text-foreground",
                            )}
                          >
                            {item.vendor_name}
                          </p>
                        )}
                        {vendorCompany ? (
                          <p className="line-clamp-2 text-xs font-medium text-primary/75">{vendorCompany}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">—</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground/90">{psName ?? "—"}</p>
                        {item.account_name ? (
                          <p className="text-xs font-medium text-primary/75">{item.account_name}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      {item.technology_name ? (
                        <span className="inline-block rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {item.technology_name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right text-xs font-medium text-amber-400/90">
                      {formatRate(item.rate)}
                    </TableCell>
                  </TableRow>

                  {open && hasThreads ? (
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-black/20 px-4 py-3">
                        <div className="space-y-3">
                          {item.threads.map((thread) => (
                            <ThreadBlock key={thread.thread_id} thread={thread} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
