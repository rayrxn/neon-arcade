// Runtime shims bundled into the single-page build (stand-ins for npm packages
// that have no UMD build: zustand v5, clsx, react/jsx-runtime).
var __shims = (function () {
  var React = window.React

  // ── react/jsx-runtime ──
  function jsx(type, props, key) {
    if (key !== undefined) props = Object.assign({}, props, { key: key })
    return React.createElement(type, props)
  }
  function jsxs(type, props, key) {
    var rest = Object.assign({}, props)
    var children = rest.children
    delete rest.children
    if (key !== undefined) rest.key = key
    return Array.isArray(children)
      ? React.createElement.apply(null, [type, rest].concat(children))
      : React.createElement(type, rest, children)
  }

  // ── clsx ──
  function clsx() {
    var out = []
    function walk(a) {
      if (!a) return
      if (typeof a === 'string' || typeof a === 'number') out.push(a)
      else if (Array.isArray(a)) a.forEach(walk)
      else if (typeof a === 'object') for (var k in a) if (a[k]) out.push(k)
    }
    for (var i = 0; i < arguments.length; i++) walk(arguments[i])
    return out.join(' ')
  }

  // ── zustand (create) ──
  function create(initializer) {
    var state
    var initial
    var listeners = new Set()
    var api = {
      getState: function () { return state },
      getInitialState: function () { return initial },
      subscribe: function (l) { listeners.add(l); return function () { listeners.delete(l) } },
      setState: function (partial, replace) {
        var next = typeof partial === 'function' ? partial(state) : partial
        if (Object.is(next, state)) return
        var prev = state
        state = replace ? next : Object.assign({}, state, next)
        listeners.forEach(function (l) { l(state, prev) })
      },
    }
    state = initial = initializer(function (p, r) { api.setState(p, r) }, api.getState, api)
    function useStore(selector) {
      var sel = selector || function (s) { return s }
      return React.useSyncExternalStore(api.subscribe, function () { return sel(state) }, function () { return sel(state) })
    }
    return Object.assign(useStore, api)
  }

  // ── zustand/middleware (persist, createJSONStorage) ──
  function createJSONStorage(getStorage) {
    var storage
    try { storage = getStorage() } catch (e) { return undefined }
    if (!storage) return undefined
    return {
      getItem: function (n) { try { var v = storage.getItem(n); return v ? JSON.parse(v) : null } catch (e) { return null } },
      setItem: function (n, v) { try { storage.setItem(n, JSON.stringify(v)) } catch (e) {} },
    }
  }
  function persist(config, options) {
    return function (set, get, api) {
      var storage = options.storage || createJSONStorage(function () { return window.localStorage })
      var partialize = options.partialize || function (s) { return s }
      var version = options.version || 0
      function save() { if (storage) storage.setItem(options.name, { state: partialize(get()), version: version }) }
      var persistedSet = function (p, r) { set(p, r); save() }
      var baseSetState = api.setState
      api.setState = function (p, r) { baseSetState(p, r); save() }
      function readStored() {
        var stored = storage && storage.getItem(options.name)
        if (!stored || !stored.state) return null
        var storedVersion = stored.version || 0
        if (storedVersion === version) return stored.state
        if (options.migrate) {
          try { return options.migrate(stored.state, storedVersion) } catch (e) { return null }
        }
        return null
      }
      api.persist = {
        rehydrate: function () {
          var state = readStored()
          if (state) baseSetState(state)
          return Promise.resolve()
        },
        hasHydrated: function () { return true },
      }
      var initialState = config(persistedSet, get, api)
      var restored = readStored()
      return restored ? Object.assign({}, initialState, restored) : initialState
    }
  }

  return {
    'react/jsx-runtime': { jsx: jsx, jsxs: jsxs, Fragment: React.Fragment },
    clsx: { __esModule: true, default: clsx, clsx: clsx },
    zustand: { create: create },
    'zustand/middleware': { persist: persist, createJSONStorage: createJSONStorage },
  }
})();
