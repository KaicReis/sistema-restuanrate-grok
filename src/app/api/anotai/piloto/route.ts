import { criarPilotoAnotai } from "@/lib/anotai-pilot-http";
import { anotaiReceiverStore } from "@/lib/server/anotai-receiver-repository";
export const runtime = "nodejs";
export const POST = criarPilotoAnotai({ env: process.env, transaction: anotaiReceiverStore.transaction });
