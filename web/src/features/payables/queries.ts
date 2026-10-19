import type { QueryUtils } from "../../shared/queries";

export function payablesQueriesFor(orpc: QueryUtils) {
  return {
    invoices: orpc.invoices.queryOptions({ refetchInterval: 15_000 }),
    paymentStatus: (correlationId: string | undefined) => orpc.paymentStatus.queryOptions({ input: { correlationId: correlationId ?? "" }, enabled: Boolean(correlationId), retry: false }),
    held: orpc.held.queryOptions({ refetchInterval: 15_000 }),
    agreements: orpc.agreements.list.queryOptions({ refetchInterval: 30_000 }),
    paymentHistory: orpc.paymentHistory.queryOptions({ refetchInterval: 30_000, retry: false }),
    compensation: orpc.compensation.list.queryOptions({ retry: false }),
    workOrders: orpc.workOrders.list.queryOptions({ retry: false }),
    workOrder: (id: string) => orpc.workOrders.get.queryOptions({ input: { id }, refetchInterval: 10_000, retry: false }),
  };
}
