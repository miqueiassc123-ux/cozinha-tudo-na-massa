import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [aba, setAba] = useState("pedidos");
  const [pedidos, setPedidos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [novoProd, setNovoProd] = useState({ 
    nome: "", preco: "", categoria: "", descricao: "", ingredientes: "" 
  });
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
  const [pedidosAnterior, setPedidosAnterior] = useState([]);

  // FUNÇÃO PARA TOCAR SOM
  const tocarSomNotificacao = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Som mais alto e perceptível
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log("Som não disponível");
    }
  };

  // FUNÇÃO PARA ABRIR WHATSAPP
  const abrirWhatsApp = (telefone, pedidoId) => {
    const mensagem = `Olá! Seu pedido #${pedidoId} está sendo preparado. Acompanhe o status em tempo real!`;
    const urlWhatsApp = `https://wa.me/${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;
    window.open(urlWhatsApp, '_blank');
  };

  // FUNÇÃO PARA ABRIR LOCALIZAÇÃO
  const abrirLocalizacao = (endereco) => {
    const urlMaps = `https://www.google.com/maps/search/${encodeURIComponent(endereco)}`;
    window.open(urlMaps, '_blank');
  };

  const carregarDados = useCallback(async () => {
    try {
      const { data: peds } = await supabase.from("pedidos").select("*").order("created_at", { ascending: false });
      const { data: prods } = await supabase.from("produtos").select("*");
      
      if (peds) {
        // Detectar novos pedidos
        const novosPedidos = peds.filter(p => 
          p.status === "PENDENTE" && 
          !pedidosAnterior.some(pa => pa.id === p.id)
        );
        
        if (novosPedidos.length > 0) {
          tocarSomNotificacao();
          mostrarToast(`🔔 ${novosPedidos.length} novo${novosPedidos.length > 1 ? 's' : ''} pedido${novosPedidos.length > 1 ? 's' : ''}!`);
        }
        
        setPedidosAnterior(peds);
        setPedidos(peds);
      }
      if (prods) setProdutos(prods);
    } catch (error) {
      mostrarToast("Erro ao carregar dados");
    }
  }, [pedidosAnterior]);

  useEffect(() => {
    carregarDados();
    const channel = supabase.channel("realtime").on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => carregarDados()).subscribe();
    const channelProd = supabase.channel("realtime-prod").on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () => carregarDados()).subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(channelProd);
    };
  }, [carregarDados]);

  const mostrarToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const adicionarOuEditarProduto = async () => {
    if (!novoProd.nome || !novoProd.preco) {
      mostrarToast("Preencha Nome e Preço!");
      return;
    }

    setLoading(true);
    try {
      if (editandoId) {
        const { error } = await supabase.from("produtos").update({
          nome: novoProd.nome,
          preco: Number(novoProd.preco),
          categoria: novoProd.categoria,
          descricao: novoProd.descricao,
          ingredientes: novoProd.ingredientes
        }).eq("id", editandoId);
        if (error) throw error;
        mostrarToast("Produto atualizado!");
        setEditandoId(null);
      } else {
        const { error } = await supabase.from("produtos").insert([{
          nome: novoProd.nome,
          preco: Number(novoProd.preco),
          categoria: novoProd.categoria,
          descricao: novoProd.descricao,
          ingredientes: novoProd.ingredientes,
          ativo: true
        }]);
        if (error) throw error;
        mostrarToast("Produto adicionado!");
      }
      setNovoProd({ nome: "", preco: "", categoria: "", descricao: "", ingredientes: "" });
      await carregarDados();
    } catch (error) {
      mostrarToast("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const deletarProduto = async (id) => {
    if (!confirm("Excluir item do cardápio?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
      mostrarToast("Produto excluído!");
      await carregarDados();
    } catch (error) {
      mostrarToast("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const editarProduto = (produto) => {
    setNovoProd(produto);
    setEditandoId(produto.id);
    setAba("cardapio");
  };

  const atualizarStatus = async (id, status) => {
    const proximo = { "PENDENTE": "PREPARANDO", "PREPARANDO": "CONCLUIDO" };
    setLoading(true);
    try {
      const { error } = await supabase.from("pedidos").update({ status: proximo[status] }).eq("id", id);
      if (error) throw error;
      mostrarToast(`Status atualizado para ${proximo[status]}`);
      await carregarDados();
    } catch (error) {
      mostrarToast("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const pedidosFiltrados = filtroStatus === "TODOS" 
    ? pedidos 
    : pedidos.filter(p => p.status === filtroStatus);

  const pendentesCount = pedidos.filter(p => p.status === "PENDENTE").length;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-black text-orange-600">Tudo na Massa</h1>
          {pendentesCount > 0 && (
            <span className="bg-red-500 text-white px-3 py-1 rounded-full font-bold text-sm animate-pulse">
              {pendentesCount} pendente{pendentesCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-6 mt-4">
          <button 
            onClick={() => setAba("pedidos")} 
            className={`font-bold text-lg transition-all ${aba === "pedidos" ? "text-orange-600 border-b-2 border-orange-600" : "text-slate-600"}`}
          >
            Pedidos
          </button>
          <button 
            onClick={() => setAba("cardapio")} 
            className={`font-bold text-lg transition-all ${aba === "cardapio" ? "text-orange-600 border-b-2 border-orange-600" : "text-slate-600"}`}
          >
            Cardápio
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {aba === "pedidos" ? (
          <div>
            {/* Filtros de Status */}
            <div className="mb-6 flex gap-2 flex-wrap">
              {["TODOS", "PENDENTE", "PREPARANDO", "CONCLUIDO"].map(status => (
                <button
                  key={status}
                  onClick={() => setFiltroStatus(status)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    filtroStatus === status
                      ? "bg-orange-600 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Grid de Pedidos */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pedidosFiltrados.map(p => (
                <div 
                  key={p.id} 
                  className={`bg-white p-5 rounded-2xl shadow-md border-2 transition-all cursor-pointer ${
                    p.status === "PENDENTE" 
                      ? "border-red-400 hover:shadow-lg hover:border-red-600" 
                      : "border-slate-200 hover:border-orange-400 hover:shadow-lg"
                  }`}
                  onClick={() => setPedidoSelecionado(p)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h2 className="font-black text-lg">#{p.id}</h2>
                      <p className="text-sm text-slate-600 font-semibold">{p.cliente_nome}</p>
                    </div>
                    <span className={`font-bold px-3 py-1 rounded-full text-xs whitespace-nowrap ${
                      p.status === "PENDENTE" ? "bg-red-100 text-red-700" :
                      p.status === "PREPARANDO" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {p.status}
                    </span>
                  </div>

                  {/* Telefone */}
                  <div className="mb-3 pb-3 border-b border-slate-200">
                    <p className="text-xs text-slate-500">Telefone</p>
                    <p className="font-bold text-slate-900">{p.cliente_telefone}</p>
                  </div>

                  {/* Tipo de Consumo e Localização */}
                  <div className="mb-3 pb-3 border-b border-slate-200">
                    <p className="text-xs text-slate-500">
                      {p.tipo_consumo === "DELIVERY" ? "📍 Endereço" : "🏪 Mesa"}
                    </p>
                    <p className="font-bold text-slate-900 text-sm">{p.localizacao}</p>
                  </div>

                  {/* Método de Pagamento */}
                  <div className="mb-3 pb-3 border-b border-slate-200">
                    <p className="text-xs text-slate-500">Pagamento</p>
                    <p className="font-bold text-slate-900">{p.pagamento}</p>
                  </div>

                  {/* Itens */}
                  <div className="mb-3 pb-3 border-b border-slate-200">
                    <p className="text-xs text-slate-500">Itens</p>
                    <p className="text-sm text-slate-700">{p.itens}</p>
                  </div>

                  {/* Total */}
                  <div className="mb-4 pb-4 border-b border-slate-200">
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="text-lg font-black text-orange-600">R$ {Number(p.total).toFixed(2).replace('.', ',')}</p>
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex gap-2 mb-3">
                    {p.tipo_consumo === "DELIVERY" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirLocalizacao(p.localizacao);
                        }}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-bold text-sm transition-all"
                        title="Abrir no Google Maps"
                      >
                        📍 Localização
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirWhatsApp(p.cliente_telefone, p.id);
                      }}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-bold text-sm transition-all"
                      title="Enviar mensagem no WhatsApp"
                    >
                      💬 WhatsApp
                    </button>
                  </div>

                  {/* Botão de Status */}
                  {p.status !== "CONCLUIDO" && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        atualizarStatus(p.id, p.status);
                      }}
                      disabled={loading}
                      className="w-full bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 transition-all"
                    >
                      {p.status === "PENDENTE" ? "▶️ INICIAR PREPARO" : "✅ CONCLUIR"}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pedidosFiltrados.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg font-semibold">Nenhum pedido {filtroStatus !== "TODOS" ? `em "${filtroStatus}"` : ""}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
            <h2 className="text-xl font-black mb-4">{editandoId ? "Editar Produto" : "Adicionar ao Cardápio"}</h2>
            
            {editandoId && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded flex justify-between items-center">
                <p className="text-blue-700 font-semibold">Editando: <strong>{novoProd.nome}</strong></p>
                <button onClick={() => { setEditandoId(null); setNovoProd({ nome: "", preco: "", categoria: "", descricao: "", ingredientes: "" }); }} className="text-blue-600 font-bold">Cancelar</button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3 mb-8">
              <input placeholder="Nome" className="border p-2 rounded" value={novoProd.nome} onChange={e => setNovoProd({...novoProd, nome: e.target.value})} disabled={loading} />
              <input placeholder="Preço" className="border p-2 rounded" type="number" value={novoProd.preco} onChange={e => setNovoProd({...novoProd, preco: e.target.value})} disabled={loading} />
              <input placeholder="Categoria" className="border p-2 rounded" value={novoProd.categoria} onChange={e => setNovoProd({...novoProd, categoria: e.target.value})} disabled={loading} />
              <input placeholder="Descrição" className="border p-2 rounded" value={novoProd.descricao} onChange={e => setNovoProd({...novoProd, descricao: e.target.value})} disabled={loading} />
              <input placeholder="Ingredientes" className="border p-2 rounded md:col-span-2" value={novoProd.ingredientes} onChange={e => setNovoProd({...novoProd, ingredientes: e.target.value})} disabled={loading} />
              <button onClick={adicionarOuEditarProduto} disabled={loading} className="bg-orange-600 text-white font-bold py-2 rounded md:col-span-2 hover:bg-orange-700 disabled:opacity-50">
                {loading ? "Salvando..." : editandoId ? "ATUALIZAR PRODUTO" : "SALVAR PRODUTO"}
              </button>
            </div>

            <h2 className="text-xl font-black mb-4">Cardápio Atual</h2>
            {produtos.map(p => (
              <div key={p.id} className="flex justify-between items-center border-b py-3 hover:bg-slate-50 p-2 rounded transition-all">
                <div className="flex-1">
                  <p className="font-bold">{p.nome}</p>
                  <p className="text-xs text-slate-500">{p.ingredientes}</p>
                  <p className="text-sm font-bold text-orange-600">R$ {Number(p.preco).toFixed(2)}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => editarProduto(p)} disabled={loading} className="text-blue-500 font-bold hover:text-blue-700 disabled:opacity-50">Editar</button>
                  <button onClick={() => deletarProduto(p.id)} disabled={loading} className="text-red-500 font-bold hover:text-red-700 disabled:opacity-50">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de Detalhes do Pedido */}
      {pedidoSelecionado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black text-orange-600">Pedido #{pedidoSelecionado.id}</h2>
              <button onClick={() => setPedidoSelecionado(null)} className="text-2xl text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">CLIENTE</p>
                <p className="text-lg font-bold">{pedidoSelecionado.cliente_nome}</p>
                <p className="text-sm text-slate-600">{pedidoSelecionado.cliente_telefone}</p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">STATUS</p>
                <span className={`inline-block font-bold px-3 py-1 rounded-full text-sm ${
                  pedidoSelecionado.status === "PENDENTE" ? "bg-red-100 text-red-700" :
                  pedidoSelecionado.status === "PREPARANDO" ? "bg-yellow-100 text-yellow-700" :
                  "bg-green-100 text-green-700"
                }`}>
                  {pedidoSelecionado.status}
                </span>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">TIPO DE CONSUMO</p>
                <p className="text-sm font-bold">
                  {pedidoSelecionado.tipo_consumo === "DELIVERY" ? "📍 Delivery" : "🏪 Retirada"}
                </p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">LOCALIZAÇÃO</p>
                <p className="text-sm font-bold">{pedidoSelecionado.localizacao}</p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">PAGAMENTO</p>
                <p className="text-sm font-bold">{pedidoSelecionado.pagamento}</p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">ITENS</p>
                <p className="text-sm text-slate-700">{pedidoSelecionado.itens}</p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">TOTAL</p>
                <p className="text-2xl font-black text-orange-600">R$ {Number(pedidoSelecionado.total).toFixed(2).replace('.', ',')}</p>
              </div>

              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-bold">HORÁRIO</p>
                <p className="text-sm text-slate-600">{new Date(pedidoSelecionado.created_at).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-2 flex-col">
              <div className="flex gap-2">
                {pedidoSelecionado.tipo_consumo === "DELIVERY" && (
                  <button
                    onClick={() => {
                      abrirLocalizacao(pedidoSelecionado.localizacao);
                      setPedidoSelecionado(null);
                    }}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-bold transition-all"
                  >
                    📍 Localização
                  </button>
                )}
                <button
                  onClick={() => {
                    abrirWhatsApp(pedidoSelecionado.cliente_telefone, pedidoSelecionado.id);
                    setPedidoSelecionado(null);
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-bold transition-all"
                >
                  💬 WhatsApp
                </button>
              </div>
              {pedidoSelecionado.status !== "CONCLUIDO" && (
                <button
                  onClick={() => {
                    atualizarStatus(pedidoSelecionado.id, pedidoSelecionado.status);
                    setPedidoSelecionado(null);
                  }}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-bold disabled:opacity-50"
                >
                  {pedidoSelecionado.status === "PENDENTE" ? "▶️ INICIAR PREPARO" : "✅ CONCLUIR"}
                </button>
              )}
              <button
                onClick={() => setPedidoSelecionado(null)}
                className="w-full bg-slate-200 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
