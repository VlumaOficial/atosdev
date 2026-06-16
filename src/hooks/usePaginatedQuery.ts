import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  totalPages: number
  setPage: (p: number) => void
  setPageSize: (s: number) => void
  search: string
  setSearch: (q: string) => void
  refetch: () => void
}

interface UsePaginatedQueryOptions {
  table: string
  select?: string
  searchColumns?: string[]   // colunas para busca ilike
  orderBy?: string
  ascending?: boolean
  initialPageSize?: number
  // mapeia cada linha bruta do banco para o tipo final (ex: contagem de locais)
  mapRow?: (row: any) => any
}

export function usePaginatedQuery<T>({
  table,
  select = '*',
  searchColumns = [],
  orderBy = 'created_at',
  ascending = false,
  initialPageSize = 25,
  mapRow,
}: UsePaginatedQueryOptions): PaginatedResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [search, setSearchRaw] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from(table)
      .select(select, { count: 'exact' })
      .order(orderBy, { ascending })
      .range(from, to)

    // busca: monta um OR de ilike em cada coluna
    if (search.trim() && searchColumns.length > 0) {
      const term = search.trim().replace(/[%,]/g, '')
      const orExpr = searchColumns.map(col => `${col}.ilike.%${term}%`).join(',')
      query = query.or(orExpr)
    }

    const { data, error, count } = await query

    if (error) {
      setError(error.message)
      setItems([])
      setTotal(0)
    } else {
      const rows = mapRow ? (data as any[]).map(mapRow) : (data as any[])
      setItems(rows as T[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [table, select, orderBy, ascending, page, pageSize, search, searchColumns, mapRow])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ao buscar, volta para a primeira página
  const setSearch = useCallback((q: string) => {
    setSearchRaw(q)
    setPage(1)
  }, [])

  return {
    items, total, loading, error,
    page, pageSize, totalPages,
    setPage, setPageSize,
    search, setSearch,
    refetch: fetchData,
  }
}
