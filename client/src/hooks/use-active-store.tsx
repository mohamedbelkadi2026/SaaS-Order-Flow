import { createContext, useContext, useState, useEffect } from "react";
import { useMagasins, useStore } from "./use-store-data";

interface ActiveStoreContextType {
  activeStoreId: number | null;
  setActiveStoreId: (id: number | null) => void;
  stores: any[];
  activeStore: any | null;
}

const ActiveStoreContext = createContext<ActiveStoreContextType>({
  activeStoreId: null,
  setActiveStoreId: () => {},
  stores: [],
  activeStore: null,
});

export function ActiveStoreProvider({ children }: { children: React.ReactNode }) {
  const { data: magasins } = useMagasins();
  const { data: primaryStore } = useStore();
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("tajergrow_active_store");
    if (saved) {
      setActiveStoreId(Number(saved));
    }
  }, []);

  const allStores = [
    ...(primaryStore ? [primaryStore] : []),
    ...(magasins?.filter((m: any) => m.id !== primaryStore?.id) || []),
  ];

  const activeStore = activeStoreId
    ? allStores.find((s: any) => s.id === activeStoreId) || null
    : primaryStore || null;

  const handleSetActiveStore = (id: number | null) => {
    setActiveStoreId(id);
    if (id) {
      localStorage.setItem("tajergrow_active_store", String(id));
    } else {
      localStorage.removeItem("tajergrow_active_store");
    }
  };

  return (
    <ActiveStoreContext.Provider value={{
      activeStoreId: activeStore?.id || null,
      setActiveStoreId: handleSetActiveStore,
      stores: allStores,
      activeStore,
    }}>
      {children}
    </ActiveStoreContext.Provider>
  );
}

export function useActiveStore() {
  return useContext(ActiveStoreContext);
}
