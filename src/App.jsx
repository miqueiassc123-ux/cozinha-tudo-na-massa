import { useEffect, useMemo, useState, useCallback } from 'react'
// Cliente Supabase criado em src/supabaseClient.js (export nomeado `supabase`)
import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Constantes e helpers
// ---------------------------------------------------------------------------
const STATUS_FLOW = {
  PENDENTE: { next: 'PREPARANDO', label: 'Iniciar preparo' },
  PREPARANDO: { next: 'CONCLUIDO', label: 'Marcar como concluído' },
  CONCLUIDO: { next: null, label: '' },
}

const COLUNAS = [
  { key: 'PENDENTE', titulo: 'Pendentes', dot: 'bg-amber-500' },
  { key: 'PREPARANDO', titulo: 'Em preparo', dot: 'bg-sky-500' },
  { key: 'CONCLUIDO', titulo: 'Concluídos', dot: 'bg-emerald-500' },
]

const FORM_VAZIO = {
  nome: '',
  preco: '',
  categoria: '',
  descricao: '',
  ingredientes: '',
  ativo: true,
}

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const horaCurta = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''

// A coluna "itens" pode ser texto, array de strings ou jsonb com objetos.
function formatarItens(itens) {
  if (!itens) return []
  let lista = itens
  if (typeof itens === 'string') {
    try {
      const parsed = JSON.parse(itens)
      lista = Array.isArray(parsed) ? parsed : [itens]
    } catch {
      return itens.split(/\n|,/).map((s) => s.trim()).filter(Boolean)
    }
  }
  if (!Array.isArray(lista)) lista = [lista]
  return lista.map((i) => {
    if (typeof i === 'string') return i
    const nome = i.nome || i.produto || i.name || 'Item'
    const qtd = i.quantidade || i.qtd || i.qty
    return qtd ? `${qtd}x ${nome}` : nome
  })
}

// ---------------------------------------------------------------------------
// Componentes pequenos
// ---------------------------------------------------------------------------
function Aviso({ tipo = 'erro', children, onClose }) {
  const cores =
    tipo === 'erro'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${cores}`}>
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} className="font-medium underline underline-offset-2">
          Fechar
        </button>
      )}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20'

// ---------------------------------------------------------------------------
// Aba: Pedidos
// ---------------------------------------------------------------------------
function PedidosTab() {
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [atualizando, setAtualizando] = useState(null)
  const [conectado, setConectado] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setErro(`Não foi possível carregar os pedidos: ${error.message}`)
    else setPedidos(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()

    const canal = supabase
      .channel('pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidos((prev) =>
            prev.some((p) => p.id === payload.new.id) ? prev : [payload.new, ...prev]
          )
        } else if (payload.eventType === 'UPDATE') {
          setPedidos((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)))
        } else if (payload.eventType === 'DELETE') {
          setPedidos((prev) => prev.filter((p) => p.id !== payload.old.id))
        }
      })
      .subscribe((status) => setConectado(status === 'SUBSCRIBED'))

    return () => {
      supabase.removeChannel(canal)
    }
  }, [carregar])

  async function avancar(pedido) {
    const proximo = STATUS_FLOW[pedido.status]?.next
    if (!proximo) return
    setAtualizando(pedido.id)
    setErro('')
    const { error } = await supabase.from('pedidos').update({ status: proximo }).eq('id', pedido.id)
    if (error) setErro(`Não foi possível atualizar o pedido: ${error.message}`)
    else setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status: proximo } : p)))
    setAtualizando(null)
  }

  const porStatus = useMemo(() => {
    const grupos = { PENDENTE: [], PREPARANDO: [], CONCLUIDO: [] }
    pedidos.forEach((p) => grupos[p.status]?.push(p))
    // Fila operacional: mais antigo primeiro nos abertos
    grupos.PENDENTE.reverse()
    grupos.PREPARANDO.reverse()
    grupos.CONCLUIDO = grupos.CONCLUIDO.slice(0, 15)
    return grupos
  }, [pedidos])

  if (carregando) return <p className="py-12 text-center text-stone-500">Carregando pedidos…</p>

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">Pedidos</h2>
        <span className="flex items-center gap-2 text-sm text-stone-500">
          <span className={`h-2 w-2 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-stone-300'}`} />
          {conectado ? 'Ao vivo' : 'Reconectando…'}
        </span>
      </div>

      {erro && <Aviso onClose={() => setErro('')}>{erro}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => (
          <div key={col.key} className="rounded-xl bg-stone-100 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                {col.titulo}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                {porStatus[col.key].length}
              </span>
            </div>

            <div className="space-y-3">
              {porStatus[col.key].length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-stone-400">Nenhum pedido aqui.</p>
              )}

              {porStatus[col.key].map((p) => {
                const fluxo = STATUS_FLOW[p.status]
                return (
                  <article key={p.id} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="font-semibold text-stone-900">{p.cliente_nome || 'Cliente'}</h4>
                      <time className="text-xs text-stone-500">{horaCurta(p.created_at)}</time>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm text-stone-700">
                      {formatarItens(p.itens).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                    {fluxo?.next && (
                      <button
                        onClick={() => avancar(p)}
                        disabled={atualizando === p.id}
                        className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {atualizando === p.id ? 'Atualizando…' : fluxo.label}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Aba: Cardápio
// ---------------------------------------------------------------------------
function CardapioTab() {
  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('categoria', { ascending: true })
      .order('nome', { ascending: true })
    if (error) setErro(`Não foi possível carregar o cardápio: ${error.message}`)
    else setProdutos(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function cadastrar(e) {
    e.preventDefault()
    setErro('')
    setOk('')

    const preco = parseFloat(String(form.preco).replace(',', '.'))
    if (!form.nome.trim()) return setErro('Informe o nome do produto.')
    if (Number.isNaN(preco) || preco < 0) return setErro('Informe um preço válido.')

    setSalvando(true)
    const { data, error } = await supabase
      .from('produtos')
      .insert({
        nome: form.nome.trim(),
        preco,
        categoria: form.categoria.trim() || 'Sem categoria',
        descricao: form.descricao.trim(),
        ingredientes: form.ingredientes.trim(),
        ativo: form.ativo,
      })
      .select()
      .single()
    setSalvando(false)

    if (error) return setErro(`Não foi possível cadastrar: ${error.message}`)
    setProdutos((prev) => [...prev, data])
    setForm(FORM_VAZIO)
    setOk('Produto cadastrado.')
  }

  async function alternarAtivo(produto) {
    setErro('')
    const { error } = await supabase.from('produtos').update({ ativo: !produto.ativo }).eq('id', produto.id)
    if (error) return setErro(`Não foi possível atualizar: ${error.message}`)
    setProdutos((prev) => prev.map((p) => (p.id === produto.id ? { ...p, ativo: !p.ativo } : p)))
  }

  async function excluir(produto) {
    if (!window.confirm(`Excluir "${produto.nome}"? Essa ação não pode ser desfeita.`)) return
    setErro('')
    const { error } = await supabase.from('produtos').delete().eq('id', produto.id)
    if (error) return setErro(`Não foi possível excluir: ${error.message}`)
    setProdutos((prev) => prev.filter((p) => p.id !== produto.id))
  }

  const porCategoria = useMemo(() => {
    const mapa = {}
    produtos.forEach((p) => {
      const cat = p.categoria || 'Sem categoria'
      ;(mapa[cat] ||= []).push(p)
    })
    return Object.entries(mapa)
  }, [produtos])

  const categoriasExistentes = useMemo(
    () => [...new Set(produtos.map((p) => p.categoria).filter(Boolean))],
    [produtos]
  )

  return (
    <section className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      {/* Formulário */}
      <form
        onSubmit={cadastrar}
        className="h-fit space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200 lg:sticky lg:top-4"
      >
        <h2 className="text-lg font-semibold text-stone-900">Novo produto</h2>

        {erro && <Aviso onClose={() => setErro('')}>{erro}</Aviso>}
        {ok && <Aviso tipo="ok" onClose={() => setOk('')}>{ok}</Aviso>}

        <Campo label="Nome">
          <input className={inputCls} value={form.nome} onChange={set('nome')} placeholder="Ex.: Lasanha à bolonhesa" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Preço (R$)">
            <input
              className={inputCls}
              inputMode="decimal"
              value={form.preco}
              onChange={set('preco')}
              placeholder="0,00"
            />
          </Campo>
          <Campo label="Categoria">
            <input
              className={inputCls}
              list="categorias"
              value={form.categoria}
              onChange={set('categoria')}
              placeholder="Massas"
            />
            <datalist id="categorias">
              {categoriasExistentes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
        </div>

        <Campo label="Descrição">
          <textarea className={inputCls} rows={2} value={form.descricao} onChange={set('descricao')} />
        </Campo>

        <Campo label="Ingredientes">
          <textarea
            className={inputCls}
            rows={2}
            value={form.ingredientes}
            onChange={set('ingredientes')}
            placeholder="Separe por vírgula"
          />
        </Campo>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={set('ativo')}
            className="h-4 w-4 rounded border-stone-300 text-red-600 focus:ring-red-600"
          />
          Disponível no cardápio
        </label>

        <button
          type="submit"
          disabled={salvando}
          className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Cadastrar produto'}
        </button>
      </form>

      {/* Lista */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-stone-900">
          Cardápio <span className="font-normal text-stone-500">({produtos.length})</span>
        </h2>

        {carregando && <p className="py-8 text-center text-stone-500">Carregando cardápio…</p>}

        {!carregando && produtos.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 py-12 text-center text-stone-500">
            Nenhum produto ainda. Cadastre o primeiro ao lado.
          </p>
        )}

        {porCategoria.map(([categoria, itens]) => (
          <div key={categoria}>
            <h3 className="mb-2 text-sm font-semibold text-stone-600">{categoria}</h3>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-200">
              {itens.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className={`min-w-0 ${p.ativo ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium text-stone-900">{p.nome}</span>
                      <span className="text-sm font-semibold text-red-700">{brl(p.preco)}</span>
                    </div>
                    {p.descricao && <p className="mt-0.5 text-sm text-stone-600">{p.descricao}</p>}
                    {p.ingredientes && (
                      <p className="mt-0.5 text-xs text-stone-500">Ingredientes: {p.ingredientes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => alternarAtivo(p)}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      {p.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => excluir(p)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [aba, setAba] = useState('pedidos')

  const abas = [
    { id: 'pedidos', nome: 'Pedidos' },
    { id: 'cardapio', nome: 'Cardápio' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-stone-900">Tudo na Massa</h1>
          <nav className="flex gap-1 rounded-lg bg-stone-100 p-1" aria-label="Seções">
            {abas.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                aria-current={aba === a.id ? 'page' : undefined}
                className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
                  aba === a.id ? 'bg-white text-red-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {a.nome}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {aba === 'pedidos' ? <PedidosTab /> : <CardapioTab />}
      </main>
    </div>
  )
        }
    er-slate-200">
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
