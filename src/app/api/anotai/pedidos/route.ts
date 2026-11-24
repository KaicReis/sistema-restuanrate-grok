import { currentUser, sameOrigin } from "@/lib/server/auth";
import { criarReceiverAnotai } from "@/lib/anotai-receiver-http";
import { anotaiReceiverStore } from "@/lib/server/anotai-receiver-repository";
export const runtime = "nodejs";
const handlers = criarReceiverAnotai({ env: process.env, currentUser, sameOrigin, ...anotaiReceiverStore });
export const GET = handlers.GET;
export const POST = handlers.POST;
