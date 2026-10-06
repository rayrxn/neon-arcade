import { useEffect, useState } from 'react'

/** Timestamp yang ter-update tiap `interval` ms — untuk countdown & "x mnt lalu". */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}
