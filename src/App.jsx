import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroAtivo, setFiltroAtivo] = useState("todos");

  const buscarPedidos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setPedidos(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    buscarPedidos();

    const channel = supabase
      .channel("pedidos-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
        },
        () => {
          buscarPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buscarPedidos]);

  async function atualizarStatus(id, statusAtual) {
    let novoStatus = "PENDENTE";

    if (statusAtual === "PENDENTE") {
      novoStatus = "PREPARANDO";
    }

    if (statusAtual === "PREPARANDO") {
      novoStatus = "CONCLUIDO";
    }

    const { error } = await supabase
      .from("pedidos")
      .update({
        status: novoStatus,
      })
      .eq("id", id);

    if (!error) {
      buscarPedidos();
    }
  }

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(valor) || 0);
  };

  const formatarHora = (data) => {
    if (!data) return "--";

    return new Date(data).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pedidosFiltrados = pedidos.filter((pedido) => {
    const status = pedido.status?.toLowerCase() || "";

    if (filtroAtivo === "todos") return true;

    return status === filtroAtivo;
  });

  const totalPendentes = pedidos.filter(
    (p) => p.status?.toLowerCase() === "pendente"
  ).length;

  const faturamento = pedidos.reduce(
    (acc, p) => acc + (Number(p.total) || 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-100">

      {/* TOPO */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto p-4 flex justify-between items-center">

          <div>
            <h1 className="text-3xl font-black text-orange-600">
              Tudo na Massa
            </h1>

            <p className="text-slate-500">
              Painel de Pedidos
            </p>
          </div>

          <button
            onClick={buscarPedidos}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-5 py-3 rounded-xl"
          >
            Atualizar
          </button>

        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">

        {/* CARDS SUPERIORES */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">

          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-slate-500 text-sm">
              Pendentes
            </p>

            <p className="text-4xl font-black">
              {totalPendentes}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-slate-500 text-sm">
              Pedidos
            </p>

            <p className="text-4xl font-black">
              {pedidos.length}
            </p>
          </div>

          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow">
            <p className="text-slate-400 text-sm">
              Faturamento
            </p>

            <p className="text-4xl font-black">
              {formatarMoeda(faturamento)}
            </p>
          </div>

        </div>

        {/* FILTROS */}
        <div className="flex gap-2 mb-6 flex-wrap">

          {["todos", "pendente", "preparando", "concluido"].map(
            (filtro) => (
              <button
                key={filtro}
                onClick={() => setFiltroAtivo(filtro)}
                className={`px-5 py-2 rounded-xl font-bold ${
                  filtroAtivo === filtro
                    ? "bg-orange-600 text-white"
                    : "bg-white"
                }`}
              >
                {filtro}
              </button>
            )
          )}

        </div>

        {/* CONTEÚDO */}
        {loading ? (
          <div className="text-center text-xl">
            Carregando...
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center shadow">
            Nenhum pedido encontrado
          </div>
        ) : (
          <div className="grid xl:grid-cols-2 gap-5">

            {pedidosFiltrados.map((pedido) => {

              const telefone =
                String(pedido.cliente_telefone || "").replace(/\D/g, "");

              const whatsapp =
                telefone.length > 0
                  ? `https://wa.me/55${telefone}`
                  : null;

              const maps =
                pedido.localizacao
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      pedido.localizacao
                    )}`
                  : null;

              return (
                <div
                  key={pedido.id}
                  className="bg-white rounded-3xl p-5 shadow border"
                >

                  <div className="flex justify-between items-start mb-4">

                    <div>
                      <h2 className="text-2xl font-black">
                        Pedido #{pedido.id}
                      </h2>

                      <p className="text-slate-500">
                        {pedido.cliente_nome}
                      </p>
                    </div>

                    <span className="bg-orange-100 text-orange-700 px-4 py-2 rounded-xl font-bold">
                      {pedido.status}
                    </span>

                  </div>

                  <div className="bg-slate-100 rounded-2xl p-4 mb-4">
                    <p className="text-sm text-slate-500 mb-1">
                      Pedido
                    </p>

                    <p className="text-xl font-black whitespace-pre-wrap">
                      {pedido.itens}
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-4">

                    <div className="bg-slate-100 p-4 rounded-2xl">
                      <p className="text-xs text-slate-500">
                        TELEFONE
                      </p>

                      <p className="font-bold break-all">
                        {pedido.cliente_telefone || "Não informado"}
                      </p>

                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>

                    <div className="bg-slate-100 p-4 rounded-2xl">
                      <p className="text-xs text-slate-500">
                        LOCALIZAÇÃO
                      </p>

                      <p className="font-bold break-words">
                        {pedido.localizacao || "Não informado"}
                      </p>

                      {pedido.tipo_consumo !== "MESA" &&
                        maps && (
                          <a
                            href={maps}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold"
                          >
                            Abrir Maps
                          </a>
                        )}
                    </div>

                  </div>

                  {pedido.tipo_consumo === "MESA" && (
                    <div className="bg-yellow-400 text-black rounded-2xl p-5 text-center mb-4">

                      <p className="font-bold">
                        MESA
                      </p>

                      <p className="text-6xl font-black">
                        {String(
                          pedido.localizacao || ""
                        ).replace("Mesa ", "")}
                      </p>

                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4">

                    <div className="bg-slate-100 p-4 rounded-xl">
                      <p className="text-xs text-slate-500">
                        PAGAMENTO
                      </p>

                      <p className="font-bold">
                        {pedido.pagamento}
                      </p>
                    </div>

                    <div className="bg-slate-100 p-4 rounded-xl">
                      <p className="text-xs text-slate-500">
                        HORA
                      </p>

                      <p className="font-bold">
                        {formatarHora(
                          pedido.created_at
                        )}
                      </p>
                    </div>

                    <div className="bg-slate-100 p-4 rounded-xl">
                      <p className="text-xs text-slate-500">
                        TOTAL
                      </p>

                      <p className="font-black text-orange-600">
                        {formatarMoeda(
                          pedido.total
                        )}
                      </p>
                    </div>

                  </div>

                  {pedido.status === "PENDENTE" && (
                    <button
                      onClick={() =>
                        atualizarStatus(
                          pedido.id,
                          pedido.status
                        )
                      }
                      className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black"
                    >
                      INICIAR PREPARO
                    </button>
                  )}

                  {pedido.status === "PREPARANDO" && (
                    <button
                      onClick={() =>
                        atualizarStatus(
                          pedido.id,
                          pedido.status
                        )
                      }
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black"
                    >
                      MARCAR COMO CONCLUÍDO
                    </button>
                  )}

                </div>
              );
            })}

          </div>
        )}

      </main>
    </div>
  );
}