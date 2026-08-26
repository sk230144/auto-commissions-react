import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One request, with the four states every screen actually has: loading, error,
 * loaded-with-rows, loaded-empty. Components render all four rather than
 * treating an empty array as success and a failure as emptiness — an outage
 * must never look like an all-clear on a page about money.
 *
 *   const { data, error, loading, reload } = useApi(
 *     (signal) => api.paymentLines(body, { signal }),
 *     [depsThatChangeTheRequest]
 *   );
 *
 * `loading` is true only for the FIRST load of a given key; a refetch keeps the
 * previous rows on screen and sets `refreshing`, so the table does not blink
 * back to a spinner every keystroke.
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled, refreshing: false });
  const ctlRef = useRef(null);
  const seenRef = useRef(false);
  // Kept in a ref so changing the fetcher identity every render doesn't re-fire.
  const fnRef = useRef(fetcher);
  fnRef.current = fetcher;

  const run = useCallback(() => {
    if (!enabled) { setState({ data: null, error: null, loading: false, refreshing: false }); return; }
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;

    setState((s) => seenRef.current
      ? { ...s, refreshing: true, error: null }
      : { data: null, error: null, loading: true, refreshing: false });

    fnRef.current(ctl.signal)
      .then((data) => {
        if (ctl.signal.aborted) return;
        seenRef.current = true;
        setState({ data, error: null, loading: false, refreshing: false });
      })
      .catch((err) => {
        // A superseded request is not a failure — leave the newer one to land.
        if (ctl.signal.aborted || err?.name === "AbortError") return;
        setState({ data: null, error: err, loading: false, refreshing: false });
      });
  }, [enabled, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run();
    return () => ctlRef.current?.abort();
  }, [run]);

  return { ...state, reload: run };
}

/** Debounce a fast-changing value (search boxes) so typing is one request. */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
