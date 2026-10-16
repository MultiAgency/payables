import { os } from "./base.js";
import { agreementCommand, reviewCommand, paymentPreparation } from "../compensation-contract.js";
import { compensationSend, ownerCompensation } from "../compensation.js";
export const compensationRoutes = { compensation: {
  list: os.handler(({ context }) => ownerCompensation(context.actor ?? "local-owner", { type: "list" })),
  agreement: os.input(agreementCommand).handler(({ input, context }) => ownerCompensation(context.actor ?? "local-owner", { type: "agreement", command: input })),
  review: os.input(reviewCommand).handler(({ input, context }) => ownerCompensation(context.actor ?? "local-owner", { type: "review", command: input })),
  prepare: os.input(paymentPreparation).handler(({ input, context }) => ownerCompensation(context.actor ?? "local-owner", input)),
  send: os.input(compensationSend).handler(({ input, context }) => ownerCompensation(context.actor ?? "local-owner", input)),
} };
