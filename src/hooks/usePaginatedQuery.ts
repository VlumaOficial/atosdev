import { useState, useEffect, useCallback, useRef } from 'react'
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
  searchColumns?: string[]
  orderBy?: string
  ascending?: boolean
  initialPageSize?: number
  mapRow?: (row: any) => any
}

export function usePaginatedQuery<T>(options: UsePaginatedQueryOptions): PaginatedResult<T> {
  // Congela as opções na primeira renderização para evitar loop de dependências.
  // (table/select/searchColumns/orderBy não mudam em runtime nesta aplicação)
  const optsRef = useRef(options)

  const {
    table,
    select = '*',
    searchColumns = [],
    orderBy = 'created_at',
    ascending = false,
    initialPageSize = 25,
    mapRow,
  } = optsRef.current

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
    // Dependências apenas em valores primitivos que realmente mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
