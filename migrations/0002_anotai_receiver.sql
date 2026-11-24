CREATE TABLE "anotai_pedidos_recebidos" (
	"chave" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"data" text NOT NULL,
	"pedido" jsonb NOT NULL,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anotai_recepcao_chave_hex" CHECK ("anotai_pedidos_recebidos"."chave" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "anotai_recepcao_hash_hex" CHECK ("anotai_pedidos_recebidos"."hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "anotai_recepcao_data_iso" CHECK ("anotai_pedidos_recebidos"."data" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE INDEX "anotai_pedidos_recebidos_data_idx" ON "anotai_pedidos_recebidos" USING btree ("data");