import { QueryObserver } from '@tanstack/query-core'
import type { QueryKey, QueryObserverResult } from '@tanstack/query-core'
import { CreateBaseQueryOptions } from './types'
import { useQueryClient } from './QueryClientProvider'
import {
  onMount,
  onCleanup,
  createComputed,
  createResource,
  Signal,
} from 'solid-js'
import { reconcile } from 'solid-js/store'
import { createStore, unwrap } from 'solid-js/store'

// Base Query Function that is used to create the query.
export function createBaseQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  options: CreateBaseQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >,
  Observer: typeof QueryObserver,
): QueryObserverResult<TData, TError> {
  const queryClient = useQueryClient()

  const defaultedOptions = queryClient.defaultQueryOptions(options)
  defaultedOptions._optimisticResults = 'optimistic'
  const observer = new Observer(queryClient, defaultedOptions)

  function createDeepSignal<T>(value: T): Signal<T> {
    const [store, setStore] = createStore({
      value,
    })
    return [
      () => store.value,
      (v: T) => {
        const unwrapped = unwrap(store.value)
        typeof v === 'function' && (v = v(unwrapped))
        setStore('value', reconcile(v))
        return store.value
      },
    ] as Signal<T>
  }

  const [dataResource, { refetch }] = createResource<
    QueryObserverResult<TData, TError>
  >(
    (_, { refetching }) => {
      const result = refetching as QueryObserverResult<TData, TError>
      return new Promise((resolve) => {
        if (result.isSuccess) resolve(result)
        if (result.isError && !result.isFetching) {
          throw result.error
        }
      })
    },
    {
      initialValue: observer.getOptimisticResult(defaultedOptions),
      storage: createDeepSignal,
    },
  )

  const unsubscribe = observer.subscribe((result) => {
    refetch(result)
  })

  onCleanup(() => unsubscribe())

  onMount(() => {
    observer.setOptions(defaultedOptions, { listeners: false })
  })

  createComputed(() => {
    const newDefaultedOptions = queryClient.defaultQueryOptions(options)
    observer.setOptions(newDefaultedOptions)
  })

  return dataResource()
}
