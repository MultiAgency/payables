import { useQuery } from "@tanstack/react-query";
import { provides } from "./capability-sets";
import { gatewayQueries } from "./queries";

export { OWNER_TREASURY, PORTFOLIO } from "./capability-sets";

/** `provides` against the shared session read; false until the session is known, so nothing is requested early. */
export function useProvides(needed: readonly string[]) {
  const { data } = useQuery(gatewayQueries.session);
  return data !== undefined && provides(data, needed);
}
