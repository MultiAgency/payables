import { MULTIAGENCY_PATH } from "../shared/brand";
import { cn } from "@/lib/utils";

export function MultiAgencyLogo({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
    <path fillRule="evenodd" d={MULTIAGENCY_PATH} />
  </svg>;
}
